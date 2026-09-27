/**
 * What a user signs in with, and is found by: the login field and the e-mail,
 * each normalised by its own rule.
 */

import { UserInvalidError } from '../../errors/janus-error';
import { isStorable, UNSTORABLE } from '../../stores/storable';
import { normalizeEmail, type ResolvedType } from '../config';
import type { JsonObject, UserRecord } from '../port/types';
import type { Context } from './create-context';

/** The user's e-mail, as stored, or `null` when the schema let it be absent. */
export function emailOf(type: ResolvedType, fields: JsonObject): string | null {
	const value = fields[type.email];
	return typeof value === 'string' ? value : null;
}

/**
 * What a user signs in with, normalised: the login field, by its own rule,
 * and the e-mail, by the e-mail rule — so a user whose login is a username can
 * still be found by the e-mail a reset is requested for.
 */
export function loginsOf(
	type: ResolvedType,
	fields: JsonObject,
	where: string,
): string[] {
	const logins = new Set<string>();

	if (type.password !== null) {
		const login = fields[type.password.login];
		if (typeof login !== 'string') {
			throw new TypeError(
				`janus: password.login "${type.password.login}" did not name a string in validated ${type.name} fields — it must name a required string field`,
			);
		}
		const normalized = type.password.normalize(login);
		// The fields were checked; a function normaliser can still cut a
		// surrogate pair in half. Refused here, or the user is written with a
		// login nobody can sign in with — or not written at all, on PostgreSQL.
		if (!isStorable(normalized)) {
			const path = [type.password.login];
			throw new UserInvalidError(
				`${where}: the fields do not match the ${type.name} schema (1 issue, at ${path.join('.')})`,
				{
					issues: [
						{ path, message: `normalises to a login that ${UNSTORABLE}` },
					],
					userType: type.name,
				},
			);
		}
		logins.add(normalized);
	}

	const email = emailOf(type, fields);
	if (email !== null) logins.add(normalizeEmail(email));

	return [...logins];
}

/**
 * The user of this type whose e-mail this is, or `null`. Looked up as a
 * login — every e-mail is one — and then compared, so a username that only
 * looks like an e-mail is nobody's.
 */
export async function holderOfEmail(
	context: Context,
	type: ResolvedType,
	email: string,
): Promise<UserRecord | null> {
	const wanted = normalizeEmail(email);
	if (!isStorable(wanted)) return null;
	const record = await context.store.users.findUserByLogin(type.name, wanted);
	const held = record === null ? null : emailOf(type, record.fields);
	return held !== null && normalizeEmail(held) === wanted ? record : null;
}
