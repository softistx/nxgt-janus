import { StoreConflict, UserInvalidError } from '../../errors/janus-error';
import type { At } from '../at';
import { normalizeEmail, type ResolvedType } from '../config';
import { type AnyUser, type Context, holderOfEmail, toUser } from '../context';
import { unlessLoginTaken } from '../outage';
import type { JsonObject, UserRecord } from '../port/types';
import type { FindOrCreateApi } from '../types';
import { byLogin } from './by-login';
import type { Input } from './flow-types';
import { insert } from './insert';

/** The user holding the key as the type's own lookup reads it, or `null`. */
async function holder(
	context: Context,
	type: ResolvedType,
	key: string,
): Promise<UserRecord | null> {
	if (type.password !== null) {
		return byLogin(context, type, type.password.normalize(key));
	}
	return key.trim() === '' ? null : holderOfEmail(context, type, key);
}

/** The refusal, before any write, of an input that names another key. */
function refusal(type: ResolvedType, where: string, field: string) {
	return new UserInvalidError(
		`${where}: the fields do not match the ${type.name} schema (1 issue, at ${field})`,
		{
			issues: [
				{ path: [field], message: 'is not the key findOrCreate was given' },
			],
			userType: type.name,
		},
	);
}

/** Throws unless the validated fields name `key`, normalised as the lookup does. */
function mustNameKey(
	type: ResolvedType,
	key: string,
	where: string,
): (fields: JsonObject) => void {
	return (fields) => {
		const field = type.password === null ? type.email : type.password.login;
		const value = fields[field];
		const named =
			typeof value !== 'string'
				? null
				: type.password === null
					? normalizeEmail(value)
					: type.password.normalize(value);
		const wanted =
			type.password === null
				? normalizeEmail(key)
				: type.password.normalize(key);
		if (named === null || named !== wanted) {
			throw refusal(type, where, field);
		}
	};
}

/**
 * `findOrCreate` for one user type: the lookup by login (e-mail on a type
 * with no password), and when nobody holds the key, `input()` and the
 * creation `create` does — once more the lookup if the write lost a race.
 */
export function findOrCreateFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): FindOrCreateApi<AnyUser, Input> {
	return {
		async findOrCreate(key, input) {
			const where = at('findOrCreate');
			if (typeof key !== 'string') {
				throw new UserInvalidError(`${where}: the key must be a string`, {
					issues: [{ path: [], message: 'is not a string' }],
					userType: type.name,
				});
			}
			const found = await holder(context, type, key);
			if (found !== null) return { user: toUser(found), created: false };

			const record = await input();
			const written = await unlessLoginTaken(
				insert(context, type, record, where, mustNameKey(type, key, where)),
			);
			if (!(written instanceof StoreConflict)) {
				return { user: toUser(written), created: true };
			}
			// Lost a race, or another of the new user's logins is taken: read the key again.
			const winner = await holder(context, type, key);
			if (winner === null) throw written;
			return { user: toUser(winner), created: false };
		},
	};
}
