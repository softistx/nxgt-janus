import { createLogger, event } from '@nxgt/telemetry';
import type { Outcome } from '../traced';
import type { Call } from './call';
import {
	argumentUser,
	refusalFields,
	secondFactorFields,
	statusOf,
	userFields,
} from './fields';

const log = createLogger('@nxgt/janus');

/** The events a security review reads: who signed in, out, up, and what changed. */
const events = {
	signedUp: event('janus.signUp'),
	signedIn: event('janus.signIn'),
	signInRefused: event('janus.signIn.refused'),
	secondFactorAsked: event('janus.signIn.secondFactor'),
	signInCodeSent: event('janus.signInCode.sent'),
	secondFactorEnrolled: event('janus.secondFactor.enrolled'),
	secondFactorActivated: event('janus.secondFactor.activated'),
	secondFactorDisabled: event('janus.secondFactor.disabled'),
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
		if (!outcome.ok) {
			log.warn(events.signInRefused(refusalFields(call, outcome.refusal)));
		} else if (statusOf(outcome.value) === 'secondFactor') {
			// The password was right; the session waits for a code.
			log.info(
				events.secondFactorAsked(secondFactorFields(call, outcome.value)),
			);
		} else {
			log.info(events.signedIn(userFields(call, outcome.value)));
		}
	},
	'signInCode.request': (call, outcome) => {
		// Only when a code was issued: `null` is nobody, and says nothing.
		if (outcome.ok && outcome.value !== null) {
			log.info(events.signInCodeSent(userFields(call, outcome.value)));
		}
	},
	'signInCode.confirm': (call, outcome) => {
		if (!outcome.ok) {
			// Marked, so an alert on burnt challenges can tell the two codes apart.
			log.warn(
				events.signInRefused({
					...refusalFields(call, outcome.refusal),
					'janus.signIn.code': true,
				}),
			);
		} else if (statusOf(outcome.value) === 'secondFactor') {
			log.info(
				events.secondFactorAsked(secondFactorFields(call, outcome.value)),
			);
		} else {
			log.info(
				events.signedIn({
					...userFields(call, outcome.value),
					'janus.signIn.code': true,
				}),
			);
		}
	},
	'secondFactor.confirm': (call, outcome) => {
		if (outcome.ok) {
			log.info(
				events.signedIn({
					...userFields(call, outcome.value),
					'janus.signIn.secondFactor': true,
				}),
			);
		} else {
			log.warn(events.signInRefused(refusalFields(call, outcome.refusal)));
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
