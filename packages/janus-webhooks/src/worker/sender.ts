import type { GivingUp } from '../deliver';
import type { Settings } from '../options';
import { bodyOf } from '../payload';
import type { QueuedDelivery, WebhookQueue } from '../queue/types';
import type { Report } from '../report';
import { type Failure, post, type Target } from '../request';
import { type Guard, nameOf } from './guard';

export type Sender = ReturnType<typeof senderOf>;

/** What one delivery claimed becomes: delivered, retried, or given up. */
export function senderOf(context: {
	readonly queue: WebhookQueue;
	readonly settings: Settings;
	readonly report: Report;
	readonly guard: Guard;
	/** Whether a failure with a retry left is retried, or given up as `closed`. */
	readonly retries: () => boolean;
	/** Called with the instant a retry scheduled falls due. */
	readonly remind: (dueAt: number) => void;
}) {
	const { queue, settings, report, guard } = context;
	/** The endpoint a delivery names, by the key the queue holds it under. */
	const targetOf = (claimed: QueuedDelivery): Target | undefined =>
		settings.targets.find((one) => one.key === claimed.endpoint);

	/**
	 * Reports, then removes: a crash between the two reports it twice, where
	 * the other order could lose the report.
	 *
	 * The lease is extended **before** the report — an attempt may have spent
	 * most of it — and then every third of it while `onGivingUp` runs, so no
	 * other claim takes the delivery meanwhile. When the extension answers
	 * anything but `true`, another claim holds the delivery, or the queue
	 * cannot say: nothing is reported, and whoever claims it next decides.
	 */
	const giveUp = async (
		claimed: QueuedDelivery,
		attempts: number,
		reason: GivingUp,
	): Promise<void> => {
		const { id, lease, event } = claimed;
		const extend = () =>
			guard.call('extendLease', () =>
				queue.extendLease(id, lease, new Date(Date.now() + settings.leaseMs)),
			);
		if ((await extend()) !== true) return;
		const heartbeat = setInterval(() => void extend(), settings.leaseMs / 3);
		heartbeat.unref?.();
		try {
			const target = targetOf(claimed);
			const url = target?.url ?? null;
			const endpoint = target?.endpoint ?? claimed.endpoint;
			await report(
				{ event, url, endpoint, attempts },
				reason,
				target?.origin ?? null,
			);
		} finally {
			clearInterval(heartbeat);
		}
		await guard.call('deleteDelivery', () => queue.deleteDelivery(id, lease));
	};

	/** Gives up a delivery claimed without an attempt: its claim is not counted. */
	const abandon = (claimed: QueuedDelivery, why: GivingUp['why']) =>
		giveUp(claimed, claimed.attempts - 1, {
			why,
			...(claimed.failed ?? { status: null, error: null }),
		});

	/**
	 * The request, signed and posted — or, for a delivery whose event cannot
	 * be written as a body, a failed attempt without a request: an adapter
	 * that answers a broken event must not loop on it for ever.
	 */
	const request = async (
		target: Target,
		claimed: QueuedDelivery,
	): Promise<Failure | null> => {
		let body: string;
		try {
			body = bodyOf(claimed.event);
		} catch (failure) {
			process.emitWarning(
				`webhooks: the queue answered a delivery that cannot be sent (${nameOf(failure)}) — counted as a failed attempt`,
				{ code: 'JANUS_WEBHOOK_QUEUE_FAILED' },
			);
			return { status: null, error: nameOf(failure) };
		}
		const { send, timeoutMs } = settings;
		return post(target, claimed.event, body, send, timeoutMs);
	};

	/** One attempt: then delivered, retried, or given up. */
	const attempt = async (claimed: QueuedDelivery): Promise<void> => {
		const target = targetOf(claimed);
		if (target === undefined) return abandon(claimed, 'endpointRemoved');
		const { id, lease } = claimed;
		const failed = await request(target, claimed);
		if (failed === null) {
			await guard.call('deleteDelivery', () => queue.deleteDelivery(id, lease));
			return;
		}
		const delay = settings.delays[claimed.attempts - 1];
		if (delay === undefined || !context.retries()) {
			const why = delay === undefined ? 'retriesRanOut' : 'closed';
			return giveUp(claimed, claimed.attempts, { why, ...failed });
		}
		// From the end of the attempt, as the schedule says.
		const dueAt = Date.now() + delay;
		const kept = await guard.call('scheduleRetry', () =>
			queue.scheduleRetry(id, lease, new Date(dueAt), failed),
		);
		if (kept === true) context.remind(dueAt);
	};

	return { attempt, abandon };
}
