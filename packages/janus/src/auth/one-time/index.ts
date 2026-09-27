/**
 * What every one-time token shares — an e-mail link, a sign-in code, a
 * second-factor challenge — kept in one place so they cannot drift apart:
 * issuing it (`issue.ts`), spending it (`spend.ts`), refusing it
 * (`refusals.ts`) and the code it may carry (`codes.ts`).
 *
 * Gathered here from the files beside this one.
 */

export {
	CODE_ATTEMPTS,
	codeInvalid,
	codeMatches,
	countCodeAttempt,
	hashCode,
	unknownChallenge,
} from './codes';
export { issueCode, issueOneTime } from './issue';
export {
	type OneTimeNoun,
	refuseStale,
	refuseUnusable,
	unknownOneTime,
} from './refusals';
export { burnOneTime, spendOneTime } from './spend';
