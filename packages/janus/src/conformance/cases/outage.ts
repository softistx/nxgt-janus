import { JanusError, StoreFailure } from '../../errors/janus-error';
import type { IdentityStores } from '../../identities/port/types';
import { isOurs, ok, rejects } from '../assert';
import { at, identityRecord, sessionRecord, tokenRecord } from '../fixtures';
import type { CaseContext, ConformanceCase, PortMethod } from '../types';

/**
 * **The invariant, as cases.** For each of the eight methods whose honest
 * answer can be "nothing" — `null`, `false`, `0`, an empty page — a store that
 * cannot answer must **reject**, and the rejection must not be `NOT_FOUND`.
 *
 * Every case seeds a record first, so a store that swallows its failure into an
 * absence answers something *false* rather than something merely empty.
 *
 * The rejection is either `@nxgt/janus`'s own `StoreFailure` — the `instanceof`
 * probe, which fails on a second copy of the package — or an error that is no
 * `JanusError` at all, which the core wraps into `STORE_FAILED` itself.
 */
function outage<S extends keyof IdentityStores>(
	slot: S,
	method: PortMethod<S>,
	call: (context: CaseContext) => Promise<unknown>,
	seed: (context: CaseContext) => Promise<void>,
): ConformanceCase {
	return {
		id: `outage.${method}`,
		group: 'outage',
		name: `${slot}.${method} rejects when the store cannot answer — never null, false, 0 or an empty page`,
		needs: 'faults',
		async run(context) {
			await seed(context);
			await context.faults?.fail(slot, method);

			const error = await rejects(
				call(context),
				`${slot}.${method} under an outage should reject: answering an absence turns an outage into a silent lockout`,
			);

			if (
				error instanceof JanusError ||
				(error as { name?: unknown })?.name === 'StoreFailure'
			) {
				isOurs(error, StoreFailure, `${slot}.${method} under an outage`);
			}
			ok(
				(error as { code?: unknown } | null)?.code !== 'NOT_FOUND',
				`${slot}.${method} under an outage rejected with NOT_FOUND: an outage is never an absence`,
			);
		},
	};
}

const identity = identityRecord();
const session = sessionRecord({ identityId: identity.id });
const token = tokenRecord({ identityId: identity.id });
const now = at('2026-02-01T00:00:00.000Z');

/** Each case writes the same three records, fresh stores every time. */
const seed = async ({ stores }: CaseContext) => {
	await stores.identities.insertIdentity(identity);
	await stores.sessions.insertSession(session);
	await stores.tokens.insertToken(token);
};

export const outageCases: readonly ConformanceCase[] = [
	outage(
		'identities',
		'findIdentity',
		({ stores }) => stores.identities.findIdentity(identity.id),
		seed,
	),
	outage(
		'identities',
		'findIdentityByIdentifier',
		({ stores }) =>
			stores.identities.findIdentityByIdentifier(
				'password',
				identity.identifiers[0]?.value ?? '',
			),
		seed,
	),
	outage(
		'identities',
		'listIdentities',
		({ stores }) =>
			stores.identities.listIdentities({ after: null, limit: 10 }),
		seed,
	),
	outage(
		'sessions',
		'findSessionByTokenHash',
		({ stores }) => stores.sessions.findSessionByTokenHash(session.tokenHash),
		seed,
	),
	outage(
		'sessions',
		'extendSession',
		({ stores }) =>
			stores.sessions.extendSession(session.id, at('2099-06-01T00:00:00.000Z')),
		seed,
	),
	outage(
		'sessions',
		'revokeSession',
		({ stores }) => stores.sessions.revokeSession(session.id, now),
		seed,
	),
	outage(
		'sessions',
		'revokeIdentitySessions',
		({ stores }) => stores.sessions.revokeIdentitySessions(identity.id, now),
		seed,
	),
	outage(
		'tokens',
		'consumeToken',
		({ stores }) =>
			stores.tokens.consumeToken(token.tokenHash, 'recovery', now),
		seed,
	),
];
