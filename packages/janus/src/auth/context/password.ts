/**
 * The password steps every flow takes the same way: the type's rule, the
 * policy, the hasher, the comparison, and the rewrite of a stale hash.
 */

import { CredentialError } from '../../errors/janus-error';
import type { PasswordHasher, ResolvedType } from '../config';
import { unlessVersionConflict } from '../outage';
import type { UserRecord } from '../port/types';
import type { Context } from './create-context';

/** The type's password rule, or a wiring refusal for a JavaScript caller. */
export function passwordRule(type: ResolvedType, where: string) {
	if (type.password === null) {
		throw new TypeError(
			`${where}: the ${type.name} type does not sign in with a password — add password: { login } to it`,
		);
	}
	return type.password;
}

/** Refuses a password shorter than the policy. Reports the policy, never the password. */
export function checkPassword(
	type: ResolvedType,
	password: string,
	where: string,
): void {
	const minLength = type.password?.minLength ?? 8;
	if (typeof password !== 'string' || password.length < minLength) {
		throw new CredentialError(
			'PASSWORD_TOO_SHORT',
			`${where}: the password is shorter than the policy's ${minLength} characters`,
			{ minLength, userType: type.name },
		);
	}
}

/** The hasher. `janus()` refused a password type without one, so this is a wiring net. */
export function requireHasher(context: Context, where: string): PasswordHasher {
	if (context.hasher === null) {
		throw new TypeError(
			`${where}: no password hasher is wired — pass hasher: scryptHasher(), or bunHasher() on Bun`,
		);
	}
	return context.hasher;
}

/**
 * Whether `password` matches the stored hash. A hash whose prefix no wired
 * verifier claims is `HASH_UNSUPPORTED`, reporting the prefix, never the hash.
 */
export async function passwordMatches(
	context: Context,
	record: UserRecord,
	password: string,
	where: string,
): Promise<boolean> {
	const stored = record.password;
	if (stored === null) return false;

	const verifier = context.verifiers.find((candidate) =>
		stored.hash.startsWith(candidate.prefix),
	);
	if (verifier === undefined) {
		const hashPrefix = /^\$[^$]*\$/.exec(stored.hash)?.[0] ?? '(none)';
		throw new CredentialError(
			'HASH_UNSUPPORTED',
			`${where}: no wired verifier claims the prefix "${hashPrefix}"`,
			{ hashPrefix, userId: record.id, userType: record.type },
		);
	}

	return verifier.verify(password, stored.hash);
}

/**
 * The record, with its password hash rewritten by the current hasher when the
 * stored one is stale: written by another hasher — a `verifiers` one — or by
 * this one with other parameters. Called only once `password` has matched.
 *
 * The rewrite is conditioned on the version just read. Losing that race to a
 * concurrent update is not the sign-in's failure: the record is answered as
 * read, and the next sign-in tries again. A store failure still throws.
 */
export async function rehashed(
	context: Context,
	record: UserRecord,
	password: string,
): Promise<UserRecord> {
	const { hasher } = context;
	const stored = record.password;
	if (hasher === null || stored === null) return record;

	const stale =
		!stored.hash.startsWith(hasher.prefix) ||
		hasher.needsRehash?.(stored.hash) === true;
	if (!stale) return record;

	const written = await unlessVersionConflict(
		context.store.users.updateUser(
			record.id,
			{
				updatedAt: context.clock.now(),
				// The same password, so the same `updatedAt`: when it was *set*.
				password: {
					hash: await hasher.hash(password),
					updatedAt: stored.updatedAt,
				},
			},
			record.version,
		),
	);
	return written ?? record;
}
