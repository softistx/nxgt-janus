/**
 * User events: a listener that is not a function, an event type Janus never
 * sends, a field an event never carries — and the listener that must keep
 * compiling. Cases 32–34 of the thirty-seven — see `fixtures.ts`.
 */

import { janus } from '../../../src/index';
import { Patient, store } from './fixtures';

function events() {
	// ── 32. A listener that is not a function ────────────────────────────
	janus({
		user: Patient,
		store,
		// @ts-expect-error events is one function, called with every event
		events: { 'user.created': () => {} },
	});

	janus({
		user: Patient,
		store,
		events(event) {
			// ── 33. An event type Janus never sends ──────────────────────
			// @ts-expect-error there is no user.updated: the six are a closed set
			if (event.type === 'user.updated') return;

			// ── 34. A field an event never carries ───────────────────────
			// @ts-expect-error an event names the user by id, never by e-mail
			void event.email;
		},
	});
}

// ── And the shape that MUST keep compiling ──────────────────────────────────

// A listener that switches on the eight types, and one that is async.
const listening = janus({
	user: Patient,
	store,
	async events(event) {
		switch (event.type) {
			case 'user.created':
			case 'user.emailVerified':
			case 'user.passwordReset':
			case 'user.secondFactorEnabled':
			case 'user.secondFactorDisabled':
			case 'user.recoveryCodesRegenerated':
			case 'user.recoveryCodeUsed':
			case 'user.deleted': {
				const who: string = event.userId;
				const when: Date = event.occurredAt;
				void [who, when, event.id, event.userType];
				return;
			}
			default: {
				const never: never = event.type;
				void never;
			}
		}
	},
});

export const checked = { events, allowed: [listening] };
