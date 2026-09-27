import type { Delivery, GivingUp, WebhooksOptions } from './deliver';

/**
 * How a delivery given up is reported. `origin` is the endpoint's, for the
 * warning — `null` for one no longer configured. Never rejects.
 */
export type Report = (
	delivery: Delivery,
	reason: GivingUp,
	origin: string | null,
) => Promise<void>;

/**
 * The warning for a delivery given up with no `onGivingUp`: the origin, never
 * the URL — or the endpoint's id, for one no longer configured.
 */
function gaveUp(
	delivery: Delivery,
	reason: GivingUp,
	origin: string | null,
): string {
	const { attempts, event } = delivery;
	const plural = attempts === 1 ? '' : 's';
	const got = reason.status ?? reason.error ?? 'no answer';
	const to = origin ?? `endpoint ${delivery.endpoint}`;
	return `webhooks: gave up ${event.type} ${event.id} to ${to} after ${attempts} attempt${plural} (${reason.why}, ${got})`;
}

/**
 * How a delivery given up is reported: to `onGivingUp`, or as a
 * `JANUS_WEBHOOK_GAVE_UP` warning without one — never silence. The returned
 * function never rejects: an `onGivingUp` that throws is a warning too.
 */
export function reporterOf(onGivingUp: WebhooksOptions['onGivingUp']): Report {
	return async (delivery, reason, origin) => {
		if (onGivingUp === undefined) {
			process.emitWarning(gaveUp(delivery, reason, origin), {
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
