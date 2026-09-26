import type { Delivery, GivingUp, WebhooksOptions } from './deliver';
import type { Target } from './request';

/** The warning for a delivery given up with no `onGivingUp`: the origin, never the URL. */
function gaveUp(
	delivery: Delivery,
	reason: GivingUp,
	origin: string | undefined,
): string {
	const { attempts, event } = delivery;
	const plural = attempts === 1 ? '' : 's';
	const got = reason.status ?? reason.error ?? 'no answer';
	return `webhooks: gave up ${event.type} ${event.id} to ${origin} after ${attempts} attempt${plural} (${reason.why}, ${got})`;
}

/**
 * How a delivery given up is reported: to `onGivingUp`, or as a
 * `JANUS_WEBHOOK_GAVE_UP` warning without one — never silence. The returned
 * function never rejects: an `onGivingUp` that throws is a warning too.
 */
export function reporterOf(
	onGivingUp: WebhooksOptions['onGivingUp'],
	targets: readonly Target[],
): (delivery: Delivery, reason: GivingUp) => Promise<void> {
	return async (delivery, reason) => {
		if (onGivingUp === undefined) {
			const target = targets.find((one) => one.url === delivery.url);
			process.emitWarning(gaveUp(delivery, reason, target?.origin), {
				code: 'JANUS_WEBHOOK_GAVE_UP',
			});
			return;
		}
		try {
			await onGivingUp(delivery, reason);
		} catch (failure) {
			process.emitWarning(
				`webhooks: onGivingUp failed on ${delivery.event.type} ${delivery.event.id}: ${failure instanceof Error ? failure.name : typeof failure}`,
				{ code: 'JANUS_WEBHOOK_REPORT_FAILED' },
			);
		}
	};
}
