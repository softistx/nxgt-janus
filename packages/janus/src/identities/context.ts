/**
 * What every operation of the core shares: the resolved definition, the
 * guarded stores, the clock, the hashers — and the handful of steps every
 * operation takes the same way.
 *
 * Internal and degenericised: traits are a `JsonObject` here, and
 * `createIdentities` casts once, at the boundary, after the schema has
 * validated them.
 */

import {
	CredentialError,
	NotFoundError,
	StoreConflict,
	type TraitIssue,
	TraitsInvalidError,
} from '../errors/janus-error';
import { isIdentityId } from '../ids/identity-id';
import type { Clock } from '../time/clock';
import type { ResolvedConfig } from './define';
import { required } from './outage';
import type {
	IdentityIdentifier,
	IdentityPatch,
	IdentityRecord,
	IdentityStores,
	Json,
	JsonObject,
	StoreCapabilities,
	VerifiableAddress,
} from './port/types';
import type { StandardSchemaV1 } from './standard-schema';
import type { Identity, PasswordHasher, WriteOptions } from './types';

export interface Context {
	readonly config: ResolvedConfig;
	/** Already guarded by `outage.ts`. */
	readonly stores: IdentityStores;
	readonly capabilities: StoreCapabilities;
	readonly clock: Clock;
	readonly hasher: PasswordHasher | null;
	/** The hasher first, then every verifier: whoever claims a prefix verifies it. */
	readonly verifiers: readonly PasswordHasher[];
}

/** An identity as application code sees it: no credentials. */
export function toIdentity(record: IdentityRecord): Identity<JsonObject> {
	const { credentials, ...rest } = record;
	return { ...rest, hasPassword: credentials.password !== null };
}

/**
 * Validates traits against the definition's schema, and answers them as the
 * port holds them: an `undefined` property dropped, at every depth.
 */
export async function validateTraits(
	context: Context,
	traits: unknown,
	where: string,
): Promise<JsonObject> {
	const result = await context.config.traits['~standard'].validate(traits);

	if (result.issues !== undefined) {
		const issues: TraitIssue[] = result.issues.map((issue) => ({
			path: (issue.path ?? []).map(segmentKey),
			message: issue.message,
		}));

		// The message reports how many and where, never the values: a trait may
		// be anything the application chose to store, including something
		// private.
		throw new TraitsInvalidError(
			`${where}: the traits do not match the schema (${issues.length} issue${issues.length === 1 ? '' : 's'}, at ${issues.map((i) => i.path.join('.') || '(root)').join(', ')})`,
			{ issues },
		);
	}

	return withoutUndefined(result.value) as JsonObject;
}

function segmentKey(
	segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number {
	const key = typeof segment === 'object' ? segment.key : segment;
	return typeof key === 'number' ? key : String(key);
}

function withoutUndefined(value: unknown): Json {
	if (Array.isArray(value)) return value.map(withoutUndefined);

	if (typeof value === 'object' && value !== null) {
		const out: Record<string, Json> = {};
		for (const [key, inner] of Object.entries(value)) {
			if (inner !== undefined) out[key] = withoutUndefined(inner);
		}
		return out;
	}

	return value as Json;
}

/** The value at a dotted path of validated traits. */
function readTrait(traits: JsonObject, path: string): unknown {
	let current: unknown = traits;
	for (const segment of path.split('.')) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * The string at a path the definition names. Not a string after validation is
 * a wiring mistake — the type refuses it first — so a bare `TypeError`.
 */
function stringTrait(traits: JsonObject, path: string, option: string): string {
	const value = readTrait(traits, path);
	if (typeof value !== 'string') {
		throw new TypeError(
			`defineIdentities: ${option} "${path}" did not name a string in validated traits — it must name a required string trait`,
		);
	}
	return value;
}

/** Identifiers and addresses, as the definition derives them from traits. */
export function derive(
	context: Context,
	traits: JsonObject,
	previous: readonly VerifiableAddress[] = [],
): {
	identifiers: IdentityIdentifier[];
	addresses: VerifiableAddress[];
} {
	const { config } = context;

	const identifiers = config.identifiers.map(({ type, from, normalize }) => ({
		type,
		value: normalize(stringTrait(traits, from, `identifiers.${type}.from`)),
	}));

	const values = new Set<string>();
	if (config.verificationFrom !== null) {
		values.add(
			stringTrait(traits, config.verificationFrom, 'verification.from'),
		);
	}
	if (config.recoveryFrom !== null) {
		values.add(stringTrait(traits, config.recoveryFrom, 'recovery.from'));
	}

	// An address whose value did not change keeps its verification: editing a
	// name must not un-verify an e-mail.
	const addresses = [...values].map(
		(value): VerifiableAddress =>
			previous.find((address) => address.value === value) ?? {
				value,
				via: 'email',
				verified: false,
				verifiedAt: null,
			},
	);

	return { identifiers, addresses };
}

/** Refuses a password shorter than the policy. Reports the policy, never the password. */
export function checkPassword(
	context: Context,
	password: string,
	where: string,
): void {
	if (password.length < context.config.minLength) {
		throw new CredentialError(
			'PASSWORD_TOO_SHORT',
			`${where}: the password is shorter than the policy's ${context.config.minLength} characters`,
			{ minLength: context.config.minLength },
		);
	}
}

/** The hasher, or a wiring refusal: there is no silent fallback. */
export function requireHasher(context: Context, where: string): PasswordHasher {
	if (context.hasher === null) {
		throw new TypeError(
			`${where}: no password hasher is wired — pass options.hasher to createIdentities: scryptHasher(), or bunHasher() on Bun`,
		);
	}
	return context.hasher;
}

const notFound = (where: string, id: string) => () =>
	new NotFoundError(`${where}: no identity has this id`, {
		identityId: id,
		operation: where,
	});

/**
 * The identity, or `NOT_FOUND`. A malformed id is an absence decided without
 * reaching the store: it arrives off a URL, and it is "no such identity", not
 * a query and not an outage.
 */
export async function getRecord(
	context: Context,
	id: string,
	where: string,
): Promise<IdentityRecord> {
	const record = isIdentityId(id)
		? await context.stores.identities.findIdentity(id)
		: null;
	return required(record, notFound(where, id));
}

/**
 * One write that follows a read, under a version.
 *
 * - `patchOf` needs the record (the next traits, the next addresses): the core
 *   reads it, and a given `ifVersion` that is not the version read is a
 *   conflict decided here, with nothing written.
 * - `patchOf` does not need it and `ifVersion` is given: one round trip, the
 *   store checks the version.
 * - Neither: the core reads for the version. Two round trips, just as safe.
 */
export async function writeIdentity(
	context: Context,
	id: string,
	options: WriteOptions | undefined,
	where: string,
	patchOf: (
		record: IdentityRecord | null,
		now: Date,
	) => Omit<IdentityPatch, 'updatedAt'>,
	needsRecord: boolean,
): Promise<Identity<JsonObject>> {
	const now = context.clock.now();
	const ifVersion = options?.ifVersion;

	if (!isIdentityId(id)) throw notFound(where, id)();

	if (!needsRecord && ifVersion !== undefined) {
		const written = await context.stores.identities.updateIdentity(
			id,
			{ ...patchOf(null, now), updatedAt: now },
			ifVersion,
		);
		return toIdentity(written);
	}

	const record = await getRecord(context, id, where);

	if (ifVersion !== undefined && ifVersion !== record.version) {
		throw new StoreConflict(
			'version',
			`${where}: expected version ${ifVersion}, found ${record.version}`,
			{
				identityId: id,
				expectedVersion: ifVersion,
				actualVersion: record.version,
				operation: where,
			},
		);
	}

	const written = await context.stores.identities.updateIdentity(
		id,
		{ ...patchOf(record, now), updatedAt: now },
		record.version,
	);
	return toIdentity(written);
}
