import { parseDuration } from '../time/duration';
import type { CredentialType } from './port/types';
import type {
	Checked,
	IdentitiesConfig,
	IdentitiesDefinition,
	Normalize,
} from './types';

/**
 * Describes an identity model. Touches nothing, opens nothing — `define*`
 * describes.
 *
 * The type refuses first, on the offending key: an identifier `from` that names
 * no required string trait, a schema whose output is not JSON, a `normalize`
 * left out. What follows at run time is the net for JavaScript callers, and
 * every refusal is a bare `TypeError`: a definition is written when the
 * application is wired, never from a request.
 */
export function defineIdentities<const C extends IdentitiesConfig>(
	config: C & Checked<C>,
): IdentitiesDefinition<C> {
	resolveConfig(config, 'defineIdentities');
	return { config, kind: 'janus.identities' };
}

/** One identifier, resolved: the normaliser is a function now. */
export interface ResolvedIdentifier {
	readonly type: CredentialType;
	readonly from: string;
	readonly normalize: (value: string) => string;
}

/** A definition with every default applied and every duration in milliseconds. */
export interface ResolvedConfig {
	readonly traits: IdentitiesConfig['traits'];
	readonly schemaVersion: string;
	readonly identifiers: readonly ResolvedIdentifier[];
	readonly verificationFrom: string | null;
	readonly recoveryFrom: string | null;
	readonly minLength: number;
	readonly lifespanMs: number;
	readonly earliestRefreshMs: number | null;
	readonly tokenTtlMs: {
		readonly verification: number;
		readonly recovery: number;
	};
	readonly cookie: {
		readonly name: string;
		readonly domain: string | null;
		readonly path: string;
		readonly sameSite: 'lax' | 'strict' | 'none';
		readonly secure: boolean;
	};
}

const NORMALIZERS = {
	none: (value: string) => value,
	lowercase: (value: string) => value.toLowerCase(),
	lowercaseTrim: (value: string) => value.toLowerCase().trim(),
	nfkcLowercaseTrim: (value: string) =>
		value.normalize('NFKC').toLowerCase().trim(),
} as const satisfies Record<string, (value: string) => string>;

/** RFC 6265's cookie-name token: no control character, space, or separator. */
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** A dotted path: segments of one or more characters, no empty segment. */
const TRAIT_PATH = /^[^.]+(\.[^.]+)*$/;

/**
 * Applies the defaults and refuses what cannot be wired.
 *
 * Called by `defineIdentities`, so a refusal surfaces where the definition is
 * written, and again by `createIdentities`, which must not trust an object
 * that merely looks like a definition. `where` names the call.
 */
export function resolveConfig(
	config: IdentitiesConfig,
	where: string,
): ResolvedConfig {
	if (
		typeof config !== 'object' ||
		config === null ||
		typeof config.traits !== 'object' ||
		config.traits === null ||
		typeof config.traits['~standard']?.validate !== 'function'
	) {
		throw new TypeError(
			`${where}: traits must be a Standard Schema — a Zod 4, Valibot or ArkType schema`,
		);
	}

	const identifiers: ResolvedIdentifier[] = [];
	for (const type of ['password', 'code'] as const) {
		const identifier = config.identifiers?.[type];
		if (identifier === undefined) continue;

		identifiers.push({
			type,
			from: traitPath(identifier.from, `${where}: identifiers.${type}.from`),
			normalize: normalizer(
				identifier.normalize,
				`${where}: identifiers.${type}.normalize`,
			),
		});
	}

	const minLength = config.password?.minLength ?? 8;
	if (!Number.isInteger(minLength) || minLength < 1) {
		throw new TypeError(
			`${where}: password.minLength must be an integer of at least 1`,
		);
	}

	const cookie = config.cookie ?? {};
	const name = cookie.name ?? 'janus-session';
	if (!COOKIE_NAME.test(name)) {
		throw new TypeError(
			`${where}: cookie.name must be a cookie-name token — letters, digits and !#$%&'*+-.^_\`|~, with no space, ";" or "="`,
		);
	}
	const sameSite = cookie.sameSite ?? 'lax';
	const secure = cookie.secure ?? true;
	if (sameSite === 'none' && !secure) {
		throw new TypeError(
			`${where}: cookie.sameSite "none" requires cookie.secure — browsers refuse the cookie otherwise`,
		);
	}

	return {
		traits: config.traits,
		schemaVersion: config.schemaVersion ?? '1',
		identifiers,
		verificationFrom:
			config.verification === undefined
				? null
				: traitPath(config.verification.from, `${where}: verification.from`),
		recoveryFrom:
			config.recovery === undefined
				? null
				: traitPath(config.recovery.from, `${where}: recovery.from`),
		minLength,
		lifespanMs: parseDuration(
			config.session?.lifespan ?? '24h',
			`${where}: session.lifespan`,
		),
		earliestRefreshMs:
			config.session?.earliestRefresh === undefined
				? null
				: parseDuration(
						config.session.earliestRefresh,
						`${where}: session.earliestRefresh`,
					),
		tokenTtlMs: {
			verification: parseDuration(
				config.tokens?.verification ?? '1h',
				`${where}: tokens.verification`,
			),
			recovery: parseDuration(
				config.tokens?.recovery ?? '15m',
				`${where}: tokens.recovery`,
			),
		},
		cookie: {
			name,
			domain: cookie.domain ?? null,
			path: cookie.path ?? '/',
			sameSite,
			secure,
		},
	};
}

function traitPath(from: unknown, where: string): string {
	if (typeof from !== 'string' || !TRAIT_PATH.test(from)) {
		throw new TypeError(
			`${where} must name a string trait, as a dotted path such as "email" or "name.handle"`,
		);
	}
	return from;
}

function normalizer(rule: Normalize, where: string): (value: string) => string {
	if (typeof rule === 'function') return rule;
	if (typeof rule === 'string' && Object.hasOwn(NORMALIZERS, rule)) {
		return NORMALIZERS[rule];
	}

	throw new TypeError(
		`${where} must be "none", "lowercase", "lowercaseTrim", "nfkcLowercaseTrim" or a function — there is no default`,
	);
}
