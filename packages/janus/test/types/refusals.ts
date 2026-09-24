/**
 * What this package refuses at COMPILE time.
 *
 * Checked by `tsc --noEmit`, never run. Every `@ts-expect-error` here is a
 * refusal that stops holding the moment the directive goes unused — so a
 * refusal that quietly weakens fails the typecheck instead of passing
 * unnoticed.
 *
 * This file is the measurement behind the claim in the README. The rule comes
 * from `nxgt-data/AGENTS.md`, and so does the reason to distrust the claim
 * without it:
 *
 * > Type safety is what the compiler rejects, not what the README claims: when
 * > this was last measured on `@nxgt/mongo`, seven of twelve plausible mistakes
 * > still compiled.
 *
 * **Fourteen plausible mistakes, fourteen refused** — and one measured gap, kept
 * here on purpose: see `spacedUnit`. Add a case whenever a public shape gains
 * something it should refuse; never delete one to make a change pass. A count
 * that goes down is a regression, and a gap that is written down is worth more
 * than one quietly omitted.
 */

import {
	CredentialError,
	type CursorPage,
	type Duration,
	isSubjectSet,
	type JanusErrorCode,
	type RelationTuple,
	StoreConflict,
	StoreFailure,
	type Subject,
	type SubjectSet,
	subjectOf,
	TokenError,
	UserInactiveError,
} from '../../src/index';

// ── 1. A code the union does not declare ─────────────────────────────────────
// A typo in a code is a branch that never runs, and nothing at runtime would
// say so.
// @ts-expect-error 'STORE_FAILURE' is not a JanusErrorCode
const wrongCode: JanusErrorCode = 'STORE_FAILURE';

// ── 2. An exhaustive switch that stops being exhaustive ──────────────────────
// The guarantee that adding a code breaks every caller that handles them all,
// rather than silently falling through to `undefined`.
function answer(code: JanusErrorCode): number {
	switch (code) {
		case 'STORE_FAILED':
			return 503;
		default:
			return 500;
	}
}

function incomplete(code: 'STORE_FAILED' | 'NOT_FOUND'): number {
	switch (code) {
		case 'STORE_FAILED':
			return 503;
	}
	// @ts-expect-error not every branch returns: NOT_FOUND has none
	return;
}

// ── 3. A constraint name StoreConflict does not know ─────────────────────────
// `on` decides the code, so a third value would produce an error with no code.
// @ts-expect-error 'unique' is not a constraint this class distinguishes
const wrongConstraint = new StoreConflict('unique', 'taken');

// ── 4. A credential code on the wrong class ──────────────────────────────────
// Each subclass narrows the union it may carry, so a token code cannot be
// smuggled onto a credential error and answered as 401 by the wrong branch.
// @ts-expect-error TOKEN_SPENT is not a CredentialError's code
const wrongFamily = new CredentialError('TOKEN_SPENT', 'x');

// ── 5. A code on a class that has only one ─────────────────────────────────
// `UserInactiveError` is always USER_INACTIVE; its constructor takes no code.
// @ts-expect-error a UserInactiveError's code is fixed: the second argument is options
const wrongSession = new UserInactiveError('x', 'NOT_FOUND');

// ── 6. A token code on the wrong class ──────────────────────────────────────
// @ts-expect-error STORE_FAILED is not a TokenError's code
const wrongToken = new TokenError('STORE_FAILED', 'x');

// ── 7. Overwriting an error's code ──────────────────────────────────────────
// `code` is readonly: a handler that reassigned one would turn an outage into
// whatever it liked, which is the failure this whole package is built against.
const outage = new StoreFailure('the store could not answer');
// @ts-expect-error code is readonly
outage.code = 'NOT_FOUND';

// ── 8. snake_case on a public shape ─────────────────────────────────────────
// The repository's casing rule, held by the compiler and not only by review.
// The refusal lands on the offending KEY, not on the declaration — which is the
// whole point of the naming rule: the compiler says `subject_set`, and suggests
// `subjectSet`.
const snakeSubject: Subject = {
	// @ts-expect-error subject_set is not a key of Subject; it is subjectSet
	subject_set: { namespace: 'Group', object: 'eng', relation: 'members' },
};

// ── 9. A subject set missing a field ────────────────────────────────────────
// All three are required: a set with no relation names everyone, which is the
// one answer a permission system must never give by accident.
// @ts-expect-error relation is missing
const partialSet: SubjectSet = { namespace: 'Group', object: 'eng' };

// ── 10. Reading a subject set without narrowing ─────────────────────────────
// `isSubjectSet` is the discriminant; reaching past it is how a subject id gets
// treated as a set.
function readWithoutNarrowing(subject: Subject): string {
	// @ts-expect-error a Subject may be a string, which has no subjectSet
	return subject.subjectSet.relation;
}

function readWithNarrowing(subject: Subject): string {
	return isSubjectSet(subject) ? subject.subjectSet.relation : subject;
}

// ── 11. A tuple whose subject is neither shape ──────────────────────────────
const wrongSubject: RelationTuple = {
	namespace: 'Note',
	object: '1',
	relation: 'viewers',
	// @ts-expect-error a number is neither a subject id nor a subject set
	subject: 42,
};

// ── 12. Editing what a store answered ──────────────────────────────────────
// `items` is readonly: a mutation would not reach the store, so it can only
// mislead whoever wrote it.
declare const page: CursorPage<{ id: string }>;
// @ts-expect-error items is readonly
page.items.push({ id: 'x' });

// ── 13. A page whose cursor is absent rather than null ─────────────────────
// `nextCursor` is `string | null` with no `undefined`: `while (cursor)` is the
// loop, and an absent field would make the last page indistinguishable from a
// store that forgot to answer — the `undefined`-versus-`null` divergence, held
// by the compiler.
// @ts-expect-error nextCursor cannot be undefined
const missingCursor: CursorPage<string> = { items: [], nextCursor: undefined };

// ── 14. A duration in a unit the type does not know ────────────────────────
// `'720hours'` is the spelling someone actually writes, and it is refused before
// the parser ever sees it. The runtime check in `parseDuration` stays for
// JavaScript callers.
// @ts-expect-error 'hours' is not one of ms | s | m | h | d
const wrongUnit: Duration = '720hours';

/**
 * A measured GAP, recorded rather than claimed.
 *
 * `'30 m'` **compiles**: TypeScript's `${number}` placeholder tolerates trailing
 * whitespace inside the number, so the template literal type cannot refuse it.
 * `parseDuration`'s own pattern does, and `duration.spec.ts` asserts that —
 * which is the only reason this is a documented limit and not a hole.
 *
 * It stays in this file because the point of the file is the honest count. A
 * refusal we do not have is worth more written down than quietly omitted.
 */
const spacedUnit: Duration = '30 m';

const goodUnit: Duration = '720h';
const numericDuration: Duration = 30_000;

// ── And the shapes that MUST keep compiling ─────────────────────────────────
// A refusal that also refuses the correct call is not type safety, it is a bug.

const goodCode: JanusErrorCode = 'STORE_FAILED';
const goodConstraint = new StoreConflict('login', 'taken', {
	login: 'a@b.test',
});
const goodCredential = new CredentialError('PASSWORD_TOO_SHORT', 'x', {
	minLength: 8,
});
const goodSubject: Subject = {
	subjectSet: { namespace: 'Group', object: 'eng', relation: 'members' },
};
const goodTuple: RelationTuple = {
	namespace: 'Note',
	object: '1',
	relation: 'viewers',
	subject: 'alice',
};
const goodPage: CursorPage<string> = { items: ['a'], nextCursor: null };
// Deliberately `{ id }` and not a User: the join takes the narrowest shape it
// reads, so a session's `userId` works without a conversion.
const subject = subjectOf({ id: '018f-abc' });

// `noUnusedLocals` is off in this repository, as it is in nxgt-data, so these
// bindings exist only to be typechecked. Referenced here so a reader does not
// mistake them for dead code someone forgot.
export const checked = {
	answer,
	incomplete,
	readWithoutNarrowing,
	readWithNarrowing,
	refused: [
		wrongCode,
		wrongConstraint,
		wrongFamily,
		wrongSession,
		wrongToken,
		snakeSubject,
		partialSet,
		wrongSubject,
		missingCursor,
		wrongUnit,
	],
	allowed: [
		goodCode,
		goodConstraint,
		goodCredential,
		goodSubject,
		goodTuple,
		goodPage,
		goodUnit,
		numericDuration,
		spacedUnit,
		subject,
		outage,
		page,
	],
};
