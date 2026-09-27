/**
 * Resolves what `janus()` was given: applies the defaults and refuses what
 * cannot be wired, with a bare `TypeError` naming where.
 */

import { parseDuration } from '../../time/duration';
import type {
	JanusConfig,
	MultiTypeConfig,
	SingleTypeConfig,
} from './janus-config';
import { NAME } from './names';
import { RESERVED_TYPES, SINGLE_TYPE } from './reserved';
import { resolveCookie } from './resolve-cookie';
import { resolveSecondFactor } from './resolve-second-factor';
import { resolveType } from './resolve-type';
import type { ResolvedConfig, ResolvedType } from './resolved';
import type { UserSchema, UserTypeConfig } from './user-type';

/** Applies the defaults and refuses what cannot be wired. `where` names the call. */
export function resolveConfig(
	config: JanusConfig,
	where: string,
): ResolvedConfig {
	if (typeof config !== 'object' || config === null) {
		throw new TypeError(`${where}: expected a configuration object`);
	}

	const hasUser = config.user !== undefined;
	const hasUsers = config.users !== undefined;
	if (hasUser === hasUsers) {
		throw new TypeError(
			`${where}: pass either user (one user type) or users (several user types), and exactly one of them`,
		);
	}

	const types = resolveTypes(entriesOf(config, hasUsers), hasUsers, where);
	refuseHashingWithoutHasher(config, types, where);

	return {
		single: !hasUsers,
		types,
		tokenTtlMs: resolveTokenTtls(config, where),
		cookie: resolveCookie(config.cookie ?? {}, where),
		secondFactor: resolveSecondFactor(config.secondFactor, where),
	};
}

/** Every user type declared, by name: the single-type form's under {@link SINGLE_TYPE}. */
function entriesOf(
	config: JanusConfig,
	hasUsers: boolean,
): [string, UserTypeConfig][] {
	return hasUsers
		? Object.entries(config.users as MultiTypeConfig['users'])
		: [
				[
					SINGLE_TYPE,
					{
						...(config as SingleTypeConfig),
						schema: config.user as UserSchema,
					},
				],
			];
}

function resolveTypes(
	entries: [string, UserTypeConfig][],
	hasUsers: boolean,
	where: string,
): Map<string, ResolvedType> {
	if (entries.length === 0) {
		throw new TypeError(`${where}: users declares no user type`);
	}

	const types = new Map<string, ResolvedType>();
	for (const [name, type] of entries) {
		const at = hasUsers ? `${where}: users.${name}` : where;

		if (!NAME.test(name)) {
			throw new TypeError(
				`${where}: the user type "${name}" must be a camelCase name — letters and digits, starting with a letter`,
			);
		}
		if ((RESERVED_TYPES as readonly string[]).includes(name)) {
			throw new TypeError(
				`${where}: "${name}" cannot name a user type — janus() answers a method of that name`,
			);
		}
		types.set(name, resolveType(name, type, at, hasUsers ? 'schema' : 'user'));
	}
	return types;
}

function refuseHashingWithoutHasher(
	config: JanusConfig,
	types: ReadonlyMap<string, ResolvedType>,
	where: string,
): void {
	const hashing = [...types.values()].some((type) => type.password !== null);
	if (hashing && config.hasher === undefined) {
		throw new TypeError(
			`${where}: a user type signs in with a password and no hasher is wired — pass hasher: scryptHasher(), or bunHasher() on Bun. There is no silent fallback`,
		);
	}
}

function resolveTokenTtls(
	config: JanusConfig,
	where: string,
): ResolvedConfig['tokenTtlMs'] {
	return {
		verifyEmail: parseDuration(
			config.tokens?.verifyEmail ?? '24h',
			`${where}: tokens.verifyEmail`,
		),
		resetPassword: parseDuration(
			config.tokens?.resetPassword ?? '1h',
			`${where}: tokens.resetPassword`,
		),
		signInCode: parseDuration(
			config.tokens?.signInCode ?? '10m',
			`${where}: tokens.signInCode`,
		),
	};
}
