/**
 * What every operation of the core shares: the resolved configuration, the
 * guarded stores, the clock, the hashers — and the handful of steps every
 * operation takes the same way.
 *
 * Internal and degenericised: fields are a `JsonObject` here, and `janus()`
 * casts once, at the boundary, after the schema has validated them.
 */

import {
	CredentialError,
	type Issue,
	NotFoundError,
	StoreConflict,
	UserInvalidError,
} from '../errors/janus-error';
import { isId, mintId } from '../ids/id';
import type { RelationStore } from '../permissions/port/types';
import { isStorable, UNSTORABLE } from '../stores/storable';
import type { Clock } from '../time/clock';
import {
	normalizeEmail,
	type PasswordHasher,
	RESERVED_FIELDS,
	type ResolvedConfig,
	type ResolvedType,
} from './config';
import { required, unlessVersionConflict } from './outage';
import type {
	JanusStores,
	Json,
	JsonObject,
	StoreCapabilities,
	UserPatch,
	UserRecord,
} from './port/types';
import type { StandardSchemaV1 } from './standard-schema';
import type { User, UserRef, WriteOptions } from './types';

export interface Context {
	readonly config: ResolvedConfig;
	/** Already guarded, by `src/stores/guard.ts`. */
	readonly store: JanusStores;
	/** Already guarded. `null` when no relation store is wired. */
	readonly relations: RelationStore | null;
	readonly capabilities: StoreCapabilities;
	readonly clock: Clock;
	readonly hasher: PasswordHasher | null;
	/** The hasher first, then every verifier: whoever claims a prefix verifies it. */
	readonly verifiers: readonly PasswordHasher[];
	/** Hashed once, lazily: what a missing user's password is compared against. */
	dummyHash(): Promise<string>;
}

export function createContext(
	config: ResolvedConfig,
	store: JanusStores,
	relations: RelationStore | null,
	capabilities: StoreCapabilities,
	clock: Clock,
	hasher: PasswordHasher | null,
	verifiers: readonly PasswordHasher[],
): Context {
	let dummy: Promise<string> | null = null;

	return {
		config,
		store,
		relations,
		capabilities,
		clock,
		hasher,
		verifiers,
		dummyHash: () => {
			if (hasher === null) {
				throw new TypeError('janus: no hasher to compare a dummy hash with');
			}
			dummy ??= hasher.hash(`janus-dummy-${mintId()}`);
			return dummy;
		},
	};
}

/** A user of any type, as the degenericised core handles them. */
export type AnyUser = User<string, Record<string, unknown>>;

/**
 * A user as application code sees it: their fields at the top level, then
 * what `janus` sets — written last, so no stored key can shadow it. No password
 * hash, ever.
 */
export function toUser(record: UserRecord): AnyUser {
	return {
		...record.fields,
		id: record.id,
		type: record.type,
		emailVerified: record.emailVerifiedAt !== null,
		active: record.active,
		hasPassword: record.password !== null,
		hasSecondFactor: record.secondFactor?.confirmedAt != null,
		version: record.version,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

/** The id a {@link UserRef} names. */
export const idOf = (user: UserRef): string =>
	typeof user === 'string' ? user : user.id;

/**
 * Validates fields against the type's schema, and answers them as the port
 * holds them: an `undefined` property dropped, at every depth.
 */
export async function validateFields(
	type: ResolvedType,
	input: unknown,
	where: string,
): Promise<JsonObject> {
	const result = await type.schema['~standard'].validate(input);

	const issues: Issue[] =
		result.issues === undefined
			? []
			: result.issues.map((issue) => ({
					path: storablePrefix((issue.path ?? []).map(segmentKey)),
					message: issue.message,
				}));

	// A schema that passes unknown keys through would let a request set `id` or
	// `active` among the fields. `toUser` would shadow them anyway; refusing
	// them says so to whoever sent them.
	if (result.issues === undefined) {
		const value = result.value as Record<string, unknown>;
		for (const key of RESERVED_FIELDS) {
			if (Object.hasOwn(value, key)) {
				issues.push({ path: [key], message: 'set by janus, not by a request' });
			}
		}
		unstorableIn(value, [], issues);
	}

	if (issues.length > 0) {
		// The message reports how many and where, never the values: a field may
		// be anything the application chose to store, including something
		// private.
		throw new UserInvalidError(
			`${where}: the fields do not match the ${type.name} schema (${issues.length} issue${issues.length === 1 ? '' : 's'}, at ${issues.map((i) => i.path.join('.') || '(root)').join(', ')})`,
			{ issues, userType: type.name },
		);
	}

	return withoutUndefined((result as { value: unknown }).value) as JsonObject;
}

/** Pushes an issue for every key and every string no store can keep. */
function unstorableIn(
	value: unknown,
	path: (string | number)[],
	issues: Issue[],
): void {
	if (typeof value === 'string') {
		if (!isStorable(value)) issues.push({ path, message: UNSTORABLE });
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, inner] of value.entries()) {
			unstorableIn(inner, [...path, index], issues);
		}
		return;
	}
	if (typeof value === 'object' && value !== null) {
		for (const [key, inner] of Object.entries(value)) {
			// The key itself stays out of the path: the path reaches the message,
			// and a NUL has no business in a log line.
			if (!isStorable(key)) {
				issues.push({ path, message: `a key ${UNSTORABLE}` });
			} else {
				unstorableIn(inner, [...path, key], issues);
			}
		}
	}
}

/**
 * A path up to its first key no store can keep: the path reaches the message,
 * and a NUL has no business in a log line.
 */
function storablePrefix(path: (string | number)[]): (string | number)[] {
	const cut = path.findIndex(
		(segment) => typeof segment === 'string' && !isStorable(segment),
	);
	return cut === -1 ? path : path.slice(0, cut);
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

const notFound = (where: string, id: string, type: string | null) =>
	new NotFoundError(
		`${where}: no ${type ?? 'user'} has this id`,
		type === null
			? { userId: id, operation: where }
			: { userId: id, userType: type, operation: where },
	);

/**
 * The user — of this type, when one is given — or `null`. A malformed id is an
 * absence decided without reaching the store: it arrives off a URL, and it is
 * "no such user", not a query and not an outage. A user of another type is
 * absent too: `auth.staff.find(patientId)` finds nobody.
 */
export async function findRecord(
	context: Context,
	id: string,
	type: string | null,
): Promise<UserRecord | null> {
	if (!isId(id)) return null;
	const record = await context.store.users.findUser(id);
	return record !== null && (type === null || record.type === type)
		? record
		: null;
}

/** The user, or `NOT_FOUND`. */
export async function getRecord(
	context: Context,
	id: string,
	type: string | null,
	where: string,
): Promise<UserRecord> {
	return required(await findRecord(context, id, type), () =>
		notFound(where, id, type),
	);
}

/**
 * One write that follows a read, under a version: the core reads the user,
 * checks `ifVersion` against what it read, computes the patch from the record,
 * and writes under the version it read. A user who changed in between is
 * `VERSION_CONFLICT`, and nothing is written.
 */
export async function writeUser(
	context: Context,
	user: UserRef,
	type: ResolvedType,
	options: WriteOptions | undefined,
	where: string,
	patchOf: (
		record: UserRecord,
		now: Date,
	) => Omit<UserPatch, 'updatedAt'> | Promise<Omit<UserPatch, 'updatedAt'>>,
): Promise<UserRecord> {
	const id = idOf(user);
	const record = await getRecord(context, id, type.name, where);
	const ifVersion = options?.ifVersion;

	if (ifVersion !== undefined && ifVersion !== record.version) {
		throw new StoreConflict(
			'version',
			`${where}: expected version ${ifVersion}, found ${record.version}`,
			{
				userId: id,
				expectedVersion: ifVersion,
				actualVersion: record.version,
				operation: where,
			},
		);
	}

	const now = context.clock.now();
	const patch = await patchOf(record, now);
	return context.store.users.updateUser(
		record.id,
		{ ...patch, updatedAt: now },
		record.version,
	);
}
