import type { Outcome } from '../traced';
import type { Call } from './call';
import { events, issued, log, markedSignIn } from './events';
import {
	argumentUser,
	provedOf,
	recoveryCodesLeft,
	refusalFields,
	secondFactorFields,
	sessionUserFields,
	signedInFields,
	statusOf,
	userFields,
	viaOf,
} from './fields';
import { mailRequest } from './mail';

/** The name `update`'s patch gives the e-mail, the field name janus defaults to. */
const EMAIL_FIELD = 'email';

/** Whether `update`'s patch (its second argument) names the e-mail field. */
function patchNamesEmail(call: Call): boolean {
	const patch = call.args[1];
	return (
		typeof patch === 'object' &&
		patch !== null &&
		(patch as Record<string, unknown>)[EMAIL_FIELD] !== undefined
	);
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
	// In two steps: prepare is counted, and send creates — what signUp writes,
	// for an account created. A taken login writes nothing: no account began.
	'signUp.prepare.send': (call, outcome) => {
		if (outcome.ok && statusOf(outcome.value) === 'created') {
			log.info(events.signedUp(userFields(call, outcome.value)));
		}
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
	// Counted per address, like the other requests for an e-mail.
	'signUp.prepare': mailRequest(),
	'verifyEmail.prepare': mailRequest(),
	'signInCode.request': mailRequest(issued(events.signInCodeSent)),
	// In two steps: prepare is counted, and send issues — what request writes.
	'signInCode.prepare': mailRequest(),
	'signInCode.prepare.send': issued(events.signInCodeSent),
	'signInCode.confirm': markedSignIn('janus.signIn.code'),
	'magicLink.request': mailRequest(issued(events.magicLinkSent)),
	'magicLink.prepare': mailRequest(),
	'magicLink.prepare.send': issued(events.magicLinkSent),
	'magicLink.confirm': markedSignIn('janus.signIn.magicLink'),
	// No credential checked here: the application carried the proof.
	signInProven: markedSignIn('janus.signIn.proven'),
	'stepUp.request': mailRequest((call, outcome) => {
		// Which code confirms it — e-mailed, or from the app — never the code.
		if (outcome.ok) {
			log.info(
				events.stepUpAsked({
					...userFields(call, outcome.value),
					'janus.stepUp.via': viaOf(outcome.value),
				}),
			);
		}
	}),
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
	// Named for the call, not the write: the same id again, or no avatar to
	// remove, answers ok and writes nothing, and the answer (the user) cannot
	// tell the two apart. The user comes from the answer, so the root form,
	// which has no type of its own, still names it. Never the id: it names an
	// image.
	'avatar.set': (call, outcome) => {
		if (outcome.ok) log.info(events.avatarSet(userFields(call, outcome.value)));
	},
	'avatar.remove': (call, outcome) => {
		if (outcome.ok) {
			log.info(events.avatarRemoved(userFields(call, outcome.value)));
		}
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
	'resetPassword.request': mailRequest(),
	'resetPassword.prepare': mailRequest(),
	'verifyEmail.send': mailRequest(),
	'changeEmail.send': mailRequest(),
	'resetPassword.confirm': (call, outcome) => {
		if (outcome.ok)
			log.info(events.passwordReset(userFields(call, outcome.value)));
	},
	'verifyEmail.confirm': (call, outcome) => {
		if (outcome.ok)
			log.info(events.emailVerified(userFields(call, outcome.value)));
	},
	// One event, not two: the move is the proof; no address is written.
	'changeEmail.confirm': (call, outcome) => {
		if (outcome.ok) {
			log.info(
				events.emailChanged({
					...userFields(call, outcome.value),
					'janus.email.proved': true,
				}),
			);
		}
	},
	// Moved without proof, whatever the application decided to trust. Read
	// from the patch: it names the `email` field (the default name; telemetry
	// does not know a renamed one), even when the value turns out unchanged.
	update: (call, outcome) => {
		if (outcome.ok && patchNamesEmail(call)) {
			log.info(
				events.emailChanged({
					...userFields(call, outcome.value),
					'janus.email.proved': false,
				}),
			);
		}
	},
	// Only when it proved: an e-mail already proved changed nothing.
	'verifyEmail.proveFirst': (call, outcome) => {
		if (outcome.ok && provedOf(outcome.value)) {
			log.info(
				events.emailVerified({
					...userFields(call, outcome.value),
					'janus.email.proveFirst': true,
				}),
			);
		}
	},
};
