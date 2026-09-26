import type { UserEventType } from '@nxgt/janus';

/**
 * Every user event type, once: `satisfies` fails to compile the day
 * `@nxgt/janus` adds a fifth, so neither `webhooks()` nor `verifyWebhook`
 * can go on refusing it unnoticed.
 */
const EVENT_TYPES = {
	'user.created': true,
	'user.emailVerified': true,
	'user.passwordReset': true,
	'user.deleted': true,
} as const satisfies Record<UserEventType, true>;

export const USER_EVENT_TYPES = Object.keys(
	EVENT_TYPES,
) as readonly UserEventType[];

export function isUserEventType(value: unknown): value is UserEventType {
	return typeof value === 'string' && Object.hasOwn(EVENT_TYPES, value);
}
