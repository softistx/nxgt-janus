import type { JanusStores } from '../../auth/port/types';
import { JanusError, StoreFailure } from '../../errors/janus-error';
import { isOurs, ok, rejects } from '../assert';
import { at, sessionRecord, tokenRecord, userRecord } from '../fixtures';
import type { CaseContext, ConformanceCase, PortMethod } from '../types';

/**
 * **The invariant, as cases.** For each of the thirteen methods whose honest
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
function outage<S extends keyof JanusStores>(
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

const user = userRecord();
const session = sessionRecord({ userId: user.id });
const token = tokenRecord({ userId: user.id });
const now = at('2026-02-01T00:00:00.000Z');

/** Each case writes the same three records, fresh stores every time. */
const seed = async ({ stores }: CaseContext) => {
	await stores.users.insertUser(user);
	await stores.sessions.insertSession(session);
	await stores.tokens.insertToken(token);
};

export const outageCases: readonly ConformanceCase[] = [
	outage(
		'users',
		'findUser',
		({ stores }) => stores.users.findUser(user.id),
		seed,
	),
	outage(
		'users',
		'findUserByLogin',
		({ stores }) =>
			stores.users.findUserByLogin(user.type, user.logins[0] ?? ''),
		seed,
	),
	outage(
		'users',
		'listUsers',
		({ stores }) =>
			stores.users.listUsers({ type: user.type, after: null, limit: 10 }),
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
		'revokeUserSessions',
		({ stores }) => stores.sessions.revokeUserSessions(user.id, now),
		seed,
	),
	outage(
		'tokens',
		'consumeToken',
		({ stores }) =>
			stores.tokens.consumeToken(token.tokenHash, 'resetPassword', now),
		seed,
	),
	outage(
		'tokens',
		'countAttempt',
		({ stores }) =>
			stores.tokens.countAttempt(token.tokenHash, 'resetPassword'),
		seed,
	),
	outage(
		'tokens',
		'spendUserTokens',
		({ stores }) =>
			stores.tokens.spendUserTokens(user.id, 'resetPassword', now),
		seed,
	),
	outage(
		'users',
		'deleteUser',
		({ stores }) => stores.users.deleteUser(user.id),
		seed,
	),
	outage(
		'sessions',
		'deleteUserSessions',
		({ stores }) => stores.sessions.deleteUserSessions(user.id),
		seed,
	),
	outage(
		'tokens',
		'deleteUserTokens',
		({ stores }) => stores.tokens.deleteUserTokens(user.id),
		seed,
	),
];
