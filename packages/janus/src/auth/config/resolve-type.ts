/** Resolves one user type: its schema, its password policy, its sessions. */

import { parseDuration } from '../../time/duration';
import { fieldName } from './names';
import { normalizer } from './normalize';
import type { PasswordConfig } from './password-config';
import type { ResolvedType } from './resolved-config';
import type { UserTypeConfig } from './user-type';

/** `at` names the type in a refusal; `schemaKey` is the key its schema came in. */
export function resolveType(
	name: string,
	type: UserTypeConfig,
	at: string,
	schemaKey: string,
): ResolvedType {
	if (
		typeof type?.schema !== 'object' ||
		type.schema === null ||
		typeof type.schema['~standard']?.validate !== 'function'
	) {
		throw new TypeError(
			`${at}: ${schemaKey} must be a Standard Schema — a Zod 4, Valibot or ArkType schema`,
		);
	}

	const password =
		type.password === undefined ? null : resolvePassword(type.password, at);

	const renewAfter = type.session?.renewAfter ?? '1d';

	return {
		name,
		schema: type.schema,
		schemaVersion: type.schemaVersion ?? '1',
		password,
		email: fieldName(type.email ?? 'email', `${at}: email`),
		lifespanMs: parseDuration(
			type.session?.lifespan ?? '7d',
			`${at}: session.lifespan`,
		),
		renewAfterMs:
			renewAfter === false
				? null
				: parseDuration(renewAfter, `${at}: session.renewAfter`),
	};
}

function resolvePassword(
	password: PasswordConfig,
	at: string,
): NonNullable<ResolvedType['password']> {
	const minLength = password.minLength ?? 8;
	if (!Number.isInteger(minLength) || minLength < 1) {
		throw new TypeError(
			`${at}: password.minLength must be an integer of at least 1`,
		);
	}
	return {
		login: fieldName(password.login, `${at}: password.login`),
		normalize: normalizer(
			password.normalize ?? 'lowercaseTrim',
			`${at}: password.normalize`,
		),
		minLength,
	};
}
