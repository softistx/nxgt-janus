import type { Settings } from '../options';
import type { WebhookQueue } from '../queue/types';
import { claimed, type Guard } from './guard';
import type { Sender } from './sender';

/** How often, at most, a queue is asked for deliveries to endpoints no longer configured. */
const ORPHAN_SWEEP = 60_000;
/** How many of them one sweep takes. */
const ORPHAN_BATCH = 100;

/** What gives up, now and then, the deliveries no endpoint configured sends. */
export interface Sweeper {
	/** Starts no sweep any more. */
	stop(): void;
	/** Resolves once the sweeps started have ended. */
	settled(): Promise<void>;
}

/** What a sweep reads, and what it gives up through. */
interface SweepContext {
	readonly queue: WebhookQueue;
	readonly settings: Settings;
	readonly guard: Guard;
	readonly sender: Sender;
	/** The keys of the endpoints configured: every other one is an orphan's. */
	readonly keys: readonly string[];
}

/** Without a queue of the caller's, nothing is left to an endpoint removed. */
export const NO_SWEEPER: Sweeper = {
	stop() {},
	settled: () => Promise.resolve(),
};

/**
 * Sweeps on an unref'd interval, each sweep chained after the one before:
 * with a queue of the caller's, a delivery can outlive its endpoint's
 * configuration.
 */
export function startSweeper(context: SweepContext): Sweeper {
	const { settings } = context;
	let sweeping: Promise<void> = Promise.resolve();
	const every = Math.min(
		ORPHAN_SWEEP,
		Math.max(settings.orphanGraceMs, settings.pollMs),
	);
	const sweeper = setInterval(() => {
		sweeping = sweeping.then(() => sweep(context));
	}, every);
	sweeper.unref?.();
	return {
		stop: () => clearInterval(sweeper),
		settled: () => sweeping,
	};
}

/**
 * Gives up the deliveries waiting for an endpoint no configuration has
 * any more, one after the other: each one's lease is extended when its
 * turn comes, before it is reported.
 */
async function sweep(context: SweepContext): Promise<void> {
	const { queue, settings, guard, sender, keys } = context;
	const now = Date.now();
	const orphans = await claimed(guard, 'claimOrphanedDeliveries', () =>
		queue.claimOrphanedDeliveries(
			keys,
			new Date(now - settings.orphanGraceMs),
			new Date(now + settings.leaseMs),
			ORPHAN_BATCH,
		),
	);
	for (const orphan of orphans ?? []) {
		await sender.abandon(orphan, 'endpointRemoved');
	}
}
