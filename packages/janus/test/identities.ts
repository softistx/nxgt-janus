/**
 * The identity core, wired the way an application wires it — Zod traits,
 * scrypt, the reference store, a clock the spec drives — for the specs under
 * `src/identities/`.
 *
 * scrypt at cost 10 rather than 17: the specs exercise every line of the
 * hasher, and do not need 128 MiB per hash to do it.
 */

import { z } from 'zod';
import { createIdentities } from '../src/identities/create';
import { defineIdentities } from '../src/identities/define';
import { scryptHasher } from '../src/identities/hashers';
import { createMemoryStores } from '../src/identities/port/memory';
import type { IdentityStores } from '../src/identities/port/types';
import type { IdentitiesOptions } from '../src/identities/types';
import { fixedClock } from '../src/time/clock';

export const traits = z.strictObject({
	email: z.email(),
	name: z.object({ first: z.string().max(256), last: z.string().max(256) }),
	nickname: z.string().optional(),
});

export const definition = defineIdentities({
	traits,
	identifiers: {
		password: { from: 'email', normalize: 'lowercaseTrim' },
		code: { from: 'email', normalize: 'lowercaseTrim', via: 'email' },
	},
	verification: { from: 'email' },
	recovery: { from: 'email' },
	password: { minLength: 8 },
	session: { lifespan: '24h', earliestRefresh: '1h' },
	tokens: { verification: '1h', recovery: '15m' },
});

export const hasher = scryptHasher({ cost: 10 });

export const ada = {
	email: 'ada@example.test',
	name: { first: 'Ada', last: 'Lovelace' },
};

export function setup(
	options: {
		stores?: IdentityStores;
		wiring?: Omit<IdentitiesOptions, 'clock'>;
	} = {},
) {
	const clock = fixedClock(Date.UTC(2026, 8, 23));
	const stores = options.stores ?? createMemoryStores();
	const identities = createIdentities(definition, stores, {
		hasher,
		...options.wiring,
		clock,
	});

	return { identities, stores, clock };
}

/** Settles a rejection where it is created, per AGENTS.md. */
export const rejection = (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(error: unknown) => error,
	);
