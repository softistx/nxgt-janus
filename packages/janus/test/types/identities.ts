/**
 * What the identity core refuses at COMPILE time, seen from the application.
 *
 * Checked by `tsc --noEmit`, never run — see `refusals.ts` for why a
 * `@ts-expect-error` is the unit of measurement. The traits type travels
 * through every method, so each of these mistakes is caught where it is
 * written, on the offending key, rather than in production.
 *
 * **Twenty plausible mistakes, twenty refused.**
 */

import { z } from 'zod';
import { requireAal } from '../../src/identities/aal';
import { createIdentities } from '../../src/identities/create';
import { defineIdentities } from '../../src/identities/define';
import { scryptHasher } from '../../src/identities/hashers';
import { createMemoryStores } from '../../src/identities/port/memory';
import type {
	PasswordHasher,
	PasswordRefusal,
} from '../../src/identities/types';

const traits = z.strictObject({
	email: z.string(),
	name: z.object({ first: z.string(), last: z.string() }),
	nickname: z.string().optional(),
	age: z.number(),
});

// ── 1. An identifier read from a trait that does not exist ─────────────────
// The typo the plan names. Refused on `from`, and the message lists the paths.
const typo = defineIdentities({
	traits,
	identifiers: {
		// @ts-expect-error "emial" is not a required string trait
		password: { from: 'emial', normalize: 'lowercaseTrim' },
	},
});

// ── 2. An identifier read from a number ───────────────────────────────────
const numeric = defineIdentities({
	traits,
	identifiers: {
		// @ts-expect-error "age" is a number, not a string
		password: { from: 'age', normalize: 'none' },
	},
});

// ── 3. An identifier read from an optional trait ──────────────────────────
// An identity could then exist with no way to sign in.
const optional = defineIdentities({
	traits,
	identifiers: {
		// @ts-expect-error "nickname" is optional
		code: { from: 'nickname', normalize: 'none', via: 'email' },
	},
});

// ── 4. A verification address read from no string trait ─────────────────
const verification = defineIdentities({
	traits,
	identifiers: {},
	// @ts-expect-error "name" is an object, not a string
	verification: { from: 'name' },
});

// ── 5. A traits schema whose output a store cannot round-trip ──────────────
const dated = defineIdentities({
	// @ts-expect-error a Date is not JSON
	traits: z.object({ born: z.date() }),
	identifiers: {},
});

// ── 6. An identifier with no normalize ────────────────────────────────────
// There is no default, on purpose.
const implicit = defineIdentities({
	traits,
	identifiers: {
		// @ts-expect-error normalize is required
		password: { from: 'email' },
	},
});

// ── 7. A normalize rule that does not exist ────────────────────────────────
const casefold = defineIdentities({
	traits,
	identifiers: {
		// @ts-expect-error 'casefold' is not a rule
		password: { from: 'email', normalize: 'casefold' },
	},
});

// ── 8. A lifespan in a unit the type does not know ────────────────────────
const hours = defineIdentities({
	traits,
	identifiers: {},
	// @ts-expect-error 'hours' is not one of ms | s | m | h | d
	session: { lifespan: '720hours' },
});

// ── 9. A SameSite spelled as the header writes it ─────────────────────────
const sameSite = defineIdentities({
	traits,
	identifiers: {},
	// @ts-expect-error 'None' is written 'none'
	cookie: { sameSite: 'None' },
});

// The definition every call below is made against.
const definition = defineIdentities({
	traits,
	identifiers: {
		password: { from: 'email', normalize: 'lowercaseTrim' },
		code: { from: 'name.first', normalize: 'none', via: 'email' },
	},
	verification: { from: 'email' },
});
const identities = createIdentities(definition, createMemoryStores(), {
	hasher: scryptHasher(),
});
const good = { email: 'a@b.test', name: { first: 'A', last: 'B' }, age: 1 };

async function calls() {
	// ── 10. A trait the schema does not declare ────────────────────────────
	await identities.create({
		// @ts-expect-error emial is not a trait
		traits: { ...good, emial: 'a@b.test' },
	});

	// ── 11. A required trait left out ──────────────────────────────────────
	// @ts-expect-error name is required
	await identities.create({ traits: { email: 'a@b.test', age: 1 } });

	// ── 12. A partial traits update ────────────────────────────────────────
	// The Kratos PUT trap from the other side: updateTraits takes the whole
	// traits, validated, never a partial the store would have to merge.
	// @ts-expect-error updateTraits takes every required trait
	await identities.updateTraits('id', { email: 'x@b.test' });

	const identity = await identities.get('id');

	// ── 13. Reading a trait that does not exist ────────────────────────────
	// @ts-expect-error the traits type travels: there is no emial
	identity.traits.emial;

	// ── 14. Reaching for a password hash ───────────────────────────────────
	// No type a request handler holds carries credentials.
	// @ts-expect-error an Identity has no credentials
	identity.credentials;

	// ── 15. Reading why before knowing whether ─────────────────────────────
	const result = await identities.verifyPassword('a@b.test', 'x');
	// @ts-expect-error reason exists only when ok is false
	result.reason;

	// ── 16. A metadata value a store cannot round-trip ─────────────────────
	// @ts-expect-error a Date is not JSON
	await identities.updateMetadata('id', { metadataPublic: { at: new Date() } });

	const { session } = await identities.sessions.create(identity.id);

	// ── 17. A session's token hash ─────────────────────────────────────────
	// @ts-expect-error a Session carries no tokenHash
	session.tokenHash;

	// ── 18. An assurance level that does not exist ─────────────────────────
	// @ts-expect-error there is no aal3
	requireAal(session, 'aal3');

	// ── 19. A token kind that does not exist ───────────────────────────────
	// @ts-expect-error a token is for verification or recovery
	await identities.tokens.issue('reset', identity.id, 'a@b.test');

	// And what must keep compiling: the narrowed result, nested traits.
	if (result.ok) {
		result.identity.traits.name.first satisfies string;
	} else {
		result.reason satisfies PasswordRefusal;
	}
	await identities.updateTraits(identity.id, { ...good, nickname: 'ada' });
}

// ── 20. A hasher that does not say which hashes it reads ──────────────────
// The prefix is how the core picks a verifier; a hasher without one would
// never be chosen, and its hashes would read as HASH_UNSUPPORTED.
// @ts-expect-error prefix is required
const anonymous: PasswordHasher = {
	hash: async () => '',
	verify: async () => false,
};

// An exhaustive switch over the refusals keeps compiling — and a new refusal
// breaks it, which is the point.
function describe(reason: PasswordRefusal): string {
	switch (reason) {
		case 'noSuchIdentity':
		case 'noPasswordCredential':
		case 'wrongPassword':
			return 'invalid credentials';
		case 'identityInactive':
			return 'account disabled';
	}
}

export const checked = {
	refused: [
		typo,
		numeric,
		optional,
		verification,
		dated,
		implicit,
		casefold,
		hours,
		sameSite,
		anonymous,
	],
	allowed: [definition, calls, describe],
};
