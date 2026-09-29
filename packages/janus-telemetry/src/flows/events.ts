import { createLogger, event } from '@nxgt/telemetry';
import type { Outcome } from '../traced';
import type { Call } from './call';
import {
	argumentUser,
	recoveryCodesLeft,
	refusalFields,
	secondFactorFields,
	sessionUserFields,
	signedInFields,
	statusOf,
	userFields,
	viaOf,
} from './fields';

const log = createLogger('@nxgt/janus');

/** The events a security review reads: who signed in, out, up, stepped up, and what changed. */
const events = {
	signedUp: event('janus.signUp'),
	signedIn: event('janus.signIn'),
	signInRefused: event('janus.signIn.refused'),
	signInThrottled: event('janus.signIn.throttled'),
	secondFactorAsked: event('janus.signIn.secondFactor'),
	signInCodeSent: event('janus.signInCode.sent'),
	magicLinkSent: event('janus.magicLink.sent'),
	stepUpAsked: event('janus.stepUp.asked'),
	stepUpConfirmed: event('janus.stepUp.confirmed'),
	stepUpRefused: event('janus.stepUp.refused'),
	secondFactorEnrolled: event('janus.secondFactor.enrolled'),
	secondFactorActivated: event('janus.secondFactor.activated'),
	secondFactorDisabled: event('janus.secondFactor.disabled'),
	recoveryCodesRegenerated: event(
		'janus.secondFactor.recoveryCodesRegenerated',
	),
	signedOut: event('janus.signOut'),
	signedOutEverywhere: event('janus.signOutEverywhere'),
	userDeleted: event('janus.user.deleted'),
	userActivated: event('janus.user.activated'),
	userDeactivated: event('janus.user.deactivated'),
	passwordChanged: event('janus.password.changed'),
	passwordSet: event('janus.password.set'),
	passwordReset: event('janus.password.reset'),
	emailVerified: event('janus.email.verified'),
};

/**
 * What a sign-in by e-mail writes once confirmed — a code or a link —
 * marked, so an alert on refusals can tell one from the other and from a
 * password: a refusal, the second factor asked for, or a sign-in.
 */
function emailedSignIn(mark: string): (call: Call, outcome: Outcome) => void {
	return (call, outcome) => {
		if (!outcome.ok) {
			log.warn(
				events.signInRefused({
					...refusalFields(call, outcome.refusal),
					[mark]: true,
				}),
			);
		} else if (statusOf(outcome.value) === 'secondFactor') {
			log.info(
				events.secondFactorAsked(secondFactorFields(call, outcome.value)),
			);
		} else {
			log.info(
				events.signedIn({
					...signedInFields(call, outcome.value),
					[mark]: true,
				}),
			);
		}
	};
}

/**
 * What each flow writes once it answered. Nothing here reads a login, an
 * e-mail, a password or a token: only user types, ids, codes and reasons.
 */
export const WRITTEN: Readonly<
	Record<string, (call: Call, outcome: Outcome) => void>
> = {
	signUp: (call, outcome) => {
		if (outcome.ok) log.info(events.signedUp(userFields(call, outcome.value)));
	},
	signIn: (call, outcome) => {
		if (!outcome.ok && outcome.refusal.reason === 'throttled') {
			// Too many passwords at one login: no password was compared.
			log.warn(
				events.signInThrottled({
					...refusalFields(call, outcome.refusal),
					'janus.signIn.retryAfter': outcome.refusal.retryAfter,
				}),
			);
		} else if (!outcome.ok) {
			log.warn(events.signInRefused(refusalFields(call, outcome.refusal)));
		} else if (statusOf(outcome.value) === 'secondFactor') {
			// The password was right; the session waits for a code.
			log.info(
				events.secondFactorAsked(secondFactorFields(call, outcome.value)),
			);
		} else {
			log.info(events.signedIn(signedInFields(call, outcome.value)));
		}
	},
	'signInCode.request': (call, outcome) => {
		// Only when a code was issued: `null` is nobody, and says nothing.
		if (outcome.ok && outcome.value !== null) {
			log.info(events.signInCodeSent(userFields(call, outcome.value)));
		}
	},
	'signInCode.confirm': emailedSignIn('janus.signIn.code'),
	'magicLink.request': (call, outcome) => {
		// Only when a link was issued: `null` is nobody, and says nothing.
		if (outcome.ok && outcome.value !== null) {
			log.info(events.magicLinkSent(userFields(call, outcome.value)));
		}
	},
	'magicLink.confirm': emailedSignIn('janus.signIn.magicLink'),
	'stepUp.request': (call, outcome) => {
		// Which code confirms it — e-mailed, or from the app — never the code.
		if (outcome.ok) {
			log.info(
				events.stepUpAsked({
					...userFields(call, outcome.value),
					'janus.stepUp.via': viaOf(outcome.value),
				}),
			);
		}
	},
	'stepUp.confirm': (call, outcome) => {
		if (outcome.ok) {
			log.info(events.stepUpConfirmed(sessionUserFields(call, outcome.value)));
		} else {
			log.warn(events.stepUpRefused(refusalFields(call, outcome.refusal)));
		}
	},
	'secondFactor.confirm': (call, outcome) => {
		if (outcome.ok) {
			log.info(
				events.signedIn({
					...signedInFields(call, outcome.value),
					'janus.signIn.secondFactor': true,
				}),
			);
		} else {
			log.warn(events.signInRefused(refusalFields(call, outcome.refusal)));
		}
	},
	'secondFactor.recover': (call, outcome) => {
		// Marked, so an alert can watch sign-ins made without the phone.
		if (outcome.ok) {
			log.info(
				events.signedIn({
					...signedInFields(call, outcome.value),
					'janus.signIn.recoveryCode': true,
					'janus.secondFactor.recoveryCodesLeft': recoveryCodesLeft(
						outcome.value,
					),
				}),
			);
		} else {
			log.warn(
				events.signInRefused({
					...refusalFields(call, outcome.refusal),
					'janus.signIn.recoveryCode': true,
				}),
			);
		}
	},
	'secondFactor.regenerateRecoveryCodes': (call, outcome) => {
		if (outcome.ok) {
			log.info(events.recoveryCodesRegenerated(argumentUser(call)));
		}
	},
	'secondFactor.enroll': (call, outcome) => {
		if (outcome.ok) log.info(events.secondFactorEnrolled(argumentUser(call)));
	},
	'secondFactor.activate': (call, outcome) => {
		if (outcome.ok) log.info(events.secondFactorActivated(argumentUser(call)));
	},
	'secondFactor.disable': (call, outcome) => {
		if (outcome.ok) log.info(events.secondFactorDisabled(argumentUser(call)));
	},
	signOut: (_call, outcome) => {
		if (outcome.ok && outcome.value === true) log.info(events.signedOut());
	},
	signOutEverywhere: (call, outcome) => {
		if (outcome.ok) log.info(events.signedOutEverywhere(argumentUser(call)));
	},
	delete: (call, outcome) => {
		if (outcome.ok && outcome.value === true) {
			log.info(events.userDeleted(argumentUser(call)));
		}
	},
	setActive: (call, outcome) => {
		if (!outcome.ok) return;
		const written =
			call.args[1] === true ? events.userActivated : events.userDeactivated;
		log.info(written(argumentUser(call)));
	},
	changePassword: (call, outcome) => {
		if (outcome.ok) log.info(events.passwordChanged(argumentUser(call)));
	},
	setPassword: (call, outcome) => {
		if (outcome.ok) log.info(events.passwordSet(argumentUser(call)));
	},
	'resetPassword.confirm': (call, outcome) => {
		if (outcome.ok)
			log.info(events.passwordReset(userFields(call, outcome.value)));
	},
	'verifyEmail.confirm': (call, outcome) => {
		if (outcome.ok)
			log.info(events.emailVerified(userFields(call, outcome.value)));
	},
};
