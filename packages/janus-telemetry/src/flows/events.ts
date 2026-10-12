import { createLogger, event } from '@nxgt/telemetry';
import type { Outcome } from '../traced';
import type { Call } from './call';
import {
	refusalFields,
	secondFactorFields,
	signedInFields,
	statusOf,
	userFields,
} from './fields';

export const log = createLogger('@nxgt/janus');

/** The events a security review reads: who signed in, out, up, stepped up, and what changed. */
export const events = {
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
	emailChanged: event('janus.email.changed'),
};

/**
 * What a sign-in other than the password's writes once answered — an
 * e-mailed code or link, or the application's own proof — marked, so an
 * alert on refusals can tell one from another and from a password: a
 * refusal, the second factor asked for, or a sign-in.
 */
export function markedSignIn(
	mark: string,
): (call: Call, outcome: Outcome) => void {
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
 * What a sign-in code or link issued writes: `sent`, with its user — only
 * when one was issued, since `null` is nobody and says nothing.
 */
export function issued(
	sent: typeof events.signInCodeSent,
): (call: Call, outcome: Outcome) => void {
	return (call, outcome) => {
		if (outcome.ok && outcome.value !== null) {
			log.info(sent(userFields(call, outcome.value)));
		}
	};
}
