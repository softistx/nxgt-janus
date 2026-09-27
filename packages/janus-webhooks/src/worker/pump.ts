import type { Settings } from '../options';
import type { QueuedDelivery, WebhookQueue } from '../queue/types';
import { claimed, type Guard } from './guard';

/** The longest wait after a queue failure: it doubles from `poll` up to this. */
const BACKOFF_MAX = 30_000;

export interface Pump {
	/**
	 * Claims what is due and starts it — now, or once the pump under way
	 * ends. `at` names the instant a retry is due: claimed as of then, so a
	 * timer that fires a millisecond early misses nothing.
	 */
	wake(at?: number): void;
	/** A request ended: the pump runs again when it had no slot left. */
	freed(): void;
	/**
	 * From now on, claims as of `at` — nothing that falls due later — and sets
	 * no timer: what `close()` without a queue sends before it drains.
	 */
	hold(at: number): void;
	/** Sets no timer any more: `close()` has begun. */
	quiet(): void;
	/** Claims nothing any more, once the pump under way ends. */
	stop(): Promise<void>;
	/** Resolves once no pump is under way. `true` when the last one claimed nothing. */
	idle(): Promise<boolean>;
}

/** What a pump claims from, and what it hands each delivery claimed to. */
interface PumpContext {
	readonly queue: WebhookQueue;
	readonly settings: Settings;
	readonly guard: Guard;
	/** Whether the queue is the caller's, shared with other processes. */
	readonly durable: boolean;
	/** How many requests are in flight. */
	readonly inFlight: () => number;
	readonly start: (delivery: QueuedDelivery) => void;
}

/** What one pump remembers from a run to the next. */
interface PumpState {
	/** The run under way, if any. */
	pumping: Promise<void> | null;
	/** Woken while a run was under way: it runs once more. */
	again: boolean;
	/** The earliest instant the next claim is made as of. */
	dueAtLeast: number;
	/** The last run found no slot free, or filled every one. */
	saturated: boolean;
	/** Where the next claim starts walking the endpoints. */
	rotation: number;
	/** The wait after a queue failure; `0` while the queue answers. */
	backoff: number;
	tick: ReturnType<typeof setTimeout> | undefined;
	/** No timer is set any more. */
	quiet: boolean;
	/** Nothing is claimed any more. */
	stopped: boolean;
	/** The instant every claim is made as of, once held. */
	heldAt: number | null;
	/** The last claim answered nothing, or failed. */
	claimedNothing: boolean;
}

/**
 * **One pump at a time**: it claims up to the free slots of `concurrency`,
 * walking the endpoints from a rotating start so one endpoint's backlog
 * cannot take every slot, starts each delivery claimed, and runs again while
 * it fills every slot or is woken meanwhile. With a queue of the caller's —
 * or while the queue fails — a timer wakes it: the poll, or the backoff.
 */
export function pumpOf(context: PumpContext): Pump {
	const keys = context.settings.targets.map((one) => one.key);
	const state: PumpState = {
		pumping: null,
		again: false,
		dueAtLeast: 0,
		saturated: false,
		rotation: 0,
		backoff: 0,
		tick: undefined,
		quiet: false,
		stopped: false,
		heldAt: null,
		claimedNothing: true,
	};

	const wake = (at = 0): void => {
		if (state.stopped) return;
		state.dueAtLeast = Math.max(state.dueAtLeast, at);
		if (state.pumping !== null) {
			state.again = true;
			return;
		}
		state.pumping = (async () => {
			for (;;) {
				state.again = false;
				const full = await pumpOnce(context, keys, state);
				if (state.stopped || !(full || state.again)) break;
			}
			arm(context, state, wake);
		})().finally(() => {
			state.pumping = null;
		});
	};

	const silence = (): void => {
		state.quiet = true;
		clearTimeout(state.tick);
	};

	arm(context, state, wake);

	return {
		wake,
		freed() {
			if (state.saturated) wake();
		},
		hold(at) {
			state.heldAt = at;
			silence();
		},
		quiet: silence,
		async stop() {
			state.stopped = true;
			await state.pumping;
		},
		async idle() {
			while (state.pumping !== null) await state.pumping;
			return state.claimedNothing;
		},
	};
}

/** Claims what is due and starts it. `true` when it took all it could. */
async function pumpOnce(
	context: PumpContext,
	keys: readonly string[],
	state: PumpState,
): Promise<boolean> {
	const { queue, settings, guard } = context;
	const free = settings.concurrency - context.inFlight();
	if (free <= 0) {
		state.saturated = true;
		return false;
	}
	const now = state.heldAt ?? Math.max(Date.now(), state.dueAtLeast);
	state.dueAtLeast = 0;
	const first = state.rotation++ % keys.length;
	const order = [...keys.slice(first), ...keys.slice(0, first)];
	const leaseUntil = new Date(now + settings.leaseMs);
	const batch = await claimed(guard, 'claimDeliveries', () =>
		queue.claimDeliveries(order, new Date(now), leaseUntil, free),
	);
	state.claimedNothing = batch === null || batch.length === 0;
	if (batch === null) {
		state.backoff = Math.min(
			Math.max(state.backoff * 2, settings.pollMs),
			BACKOFF_MAX,
		);
		return false;
	}
	state.backoff = 0;
	for (const delivery of batch) context.start(delivery);
	state.saturated = batch.length >= free;
	return state.saturated;
}

/** The next wake with no event to cause one: the poll, or a queue failure's backoff. */
function arm(context: PumpContext, state: PumpState, wake: () => void): void {
	clearTimeout(state.tick);
	if (state.quiet || (!context.durable && state.backoff === 0)) return;
	const ms =
		state.backoff > 0
			? state.backoff
			: context.settings.pollMs * (0.8 + Math.random() * 0.4);
	state.tick = setTimeout(() => wake(), ms);
	state.tick.unref?.();
}
