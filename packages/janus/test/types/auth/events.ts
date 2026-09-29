/**
 * User events: a listener that is not a function, an event type Janus never
 * sends, a field an event never carries, the new address an e-mail change
 * does not carry, the former one read as if always there — and the listener
 * that must keep compiling. Cases 32–34, 43 and 44 of the fifty-four — see
 * `fixtures.ts`.
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
			// @ts-expect-error there is no user.updated: the ten are a closed set
			if (event.type === 'user.updated') return;

			// ── 34. A field an event never carries ───────────────────────
			// @ts-expect-error an event names the user by id, never by e-mail
			void event.email;

			if (event.type === 'user.emailChanged') {
				// ── 43. The new address read off an e-mail change ────────
				// @ts-expect-error the new address is on the user: auth.get(event.userId)
				void event.newEmail;

				// ── 44. The former address read as if always there ──────
				// @ts-expect-error null for a user who had none, absent on every other type
				const former: string = event.formerEmail;
				void former;
			}
		},
	});
}

// ── And the shape that MUST keep compiling ──────────────────────────────────

// A listener that switches on the ten types, and one that is async; the
// former address read once it is known to be one.
const listening = janus({
	user: Patient,
	store,
	async events(event) {
		switch (event.type) {
			case 'user.created':
			case 'user.emailVerified':
			case 'user.passwordReset':
			case 'user.passwordChanged':
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
			case 'user.emailChanged': {
				const former: string | null | undefined = event.formerEmail;
				if (typeof former === 'string') {
					const to: string = former;
					void to;
				}
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
