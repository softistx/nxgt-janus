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

/**
 * **One pump at a time**: it claims up to the free slots of `concurrency`,
 * walking the endpoints from a rotating start so one endpoint's backlog
 * cannot take every slot, starts each delivery claimed, and runs again while
 * it fills every slot or is woken meanwhile. With a queue of the caller's —
 * or while the queue fails — a timer wakes it: the poll, or the backoff.
 */
export function pumpOf(context: {
	readonly queue: WebhookQueue;
	readonly settings: Settings;
	readonly guard: Guard;
	/** Whether the queue is the caller's, shared with other processes. */
	readonly durable: boolean;
	/** How many requests are in flight. */
	readonly inFlight: () => number;
	readonly start: (delivery: QueuedDelivery) => void;
}): Pump {
	const { queue, settings, guard } = context;
	const keys = settings.targets.map((one) => one.key);
	let pumping: Promise<void> | null = null;
	let again = false;
	let dueAtLeast = 0;
	let saturated = false;
	let rotation = 0;
	let backoff = 0;
	let tick: ReturnType<typeof setTimeout> | undefined;
	let quiet = false;
	let stopped = false;
	let heldAt: number | null = null;
	let claimedNothing = true;

	/** Claims what is due and starts it. `true` when it took all it could. */
	const pumpOnce = async (): Promise<boolean> => {
		const free = settings.concurrency - context.inFlight();
		if (free <= 0) {
			saturated = true;
			return false;
		}
		const now = heldAt ?? Math.max(Date.now(), dueAtLeast);
		dueAtLeast = 0;
		const first = rotation++ % keys.length;
		const order = [...keys.slice(first), ...keys.slice(0, first)];
		const leaseUntil = new Date(now + settings.leaseMs);
		const batch = await claimed(guard, 'claimDeliveries', () =>
			queue.claimDeliveries(order, new Date(now), leaseUntil, free),
		);
		claimedNothing = batch === null || batch.length === 0;
		if (batch === null) {
			backoff = Math.min(Math.max(backoff * 2, settings.pollMs), BACKOFF_MAX);
			return false;
		}
		backoff = 0;
		for (const delivery of batch) context.start(delivery);
		saturated = batch.length >= free;
		return saturated;
	};

	/** The next wake with no event to cause one: the poll, or a queue failure's backoff. */
	const arm = (): void => {
		clearTimeout(tick);
		if (quiet || (!context.durable && backoff === 0)) return;
		const ms =
			backoff > 0 ? backoff : settings.pollMs * (0.8 + Math.random() * 0.4);
		tick = setTimeout(() => wake(), ms);
		tick.unref?.();
	};

	const wake = (at = 0): void => {
		if (stopped) return;
		dueAtLeast = Math.max(dueAtLeast, at);
		if (pumping !== null) {
			again = true;
			return;
		}
		pumping = (async () => {
			for (;;) {
				again = false;
				const full = await pumpOnce();
				if (stopped || !(full || again)) break;
			}
			arm();
		})().finally(() => {
			pumping = null;
		});
	};

	const silence = (): void => {
		quiet = true;
		clearTimeout(tick);
	};

	arm();

	return {
		wake,
		freed() {
			if (saturated) wake();
		},
		hold(at) {
			heldAt = at;
			silence();
		},
		quiet: silence,
		async stop() {
			stopped = true;
			await pumping;
		},
		async idle() {
			while (pumping !== null) await pumping;
			return claimedNothing;
		},
	};
}
