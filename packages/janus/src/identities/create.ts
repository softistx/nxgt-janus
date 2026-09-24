import { CredentialError } from '../errors/janus-error';
import { isIdentityId, mintIdentityId } from '../ids/identity-id';
import { invalidCursor, pageLimit } from '../pagination/cursor-page';
import { systemClock } from '../time/clock';
import {
	type Context,
	checkPassword,
	derive,
	getRecord,
	requireHasher,
	toIdentity,
	validateTraits,
	writeIdentity,
} from './context';
import { resolveConfig } from './define';
import { guardStores } from './outage';
import { assertStores } from './port/assert-stores';
import type {
	CredentialType,
	IdentityRecord,
	IdentityStores,
	JsonObject,
} from './port/types';
import { sessionsOf } from './sessions';
import { tokensOf, verifiedAddresses } from './tokens';
import type {
	Identities,
	IdentitiesConfig,
	IdentitiesDefinition,
	IdentitiesOf,
	IdentitiesOptions,
	PasswordHasher,
	Session,
} from './types';

/**
 * Assembles the identity core over the stores the application opened.
 * **Synchronous, and does no I/O** — `create*` assembles.
 *
 * It checks that every store answers every method the port declares, notes the
 * optional capabilities, guards every store call through `outage.ts`, and
 * answers the surface. It connects to nothing: what the stores are connected to
 * is their business, and the application opened them.
 *
 * Refused here, each with a bare `TypeError` because only wiring produces one:
 * a store slot missing or incomplete; a password identifier with no hasher —
 * there is no silent fallback; two hashers claiming the same prefix, which
 * would make verification depend on the order they were listed in.
 */
export function createIdentities<C extends IdentitiesConfig>(
	definition: IdentitiesDefinition<C>,
	stores: IdentityStores,
	options?: IdentitiesOptions,
): IdentitiesOf<C> {
	const where = 'createIdentities';

	if (definition?.kind !== 'janus.identities') {
		throw new TypeError(
			`${where}: the first argument must come from defineIdentities`,
		);
	}

	const config = resolveConfig(definition.config, where);
	const capabilities = assertStores(stores, where);
	const hasher = options?.hasher ?? null;
	const verifiers = [
		...(hasher === null ? [] : [hasher]),
		...(options?.verifiers ?? []),
	];

	const prefixes = new Set<string>();
	for (const verifier of verifiers) {
		if (typeof verifier?.prefix !== 'string' || verifier.prefix === '') {
			throw new TypeError(`${where}: every hasher needs a non-empty prefix`);
		}
		if (prefixes.has(verifier.prefix)) {
			throw new TypeError(
				`${where}: two hashers claim the prefix "${verifier.prefix}" — which one verifies would depend on their order`,
			);
		}
		prefixes.add(verifier.prefix);
	}

	if (
		hasher === null &&
		config.identifiers.some((identifier) => identifier.type === 'password')
	) {
		throw new TypeError(
			`${where}: the definition declares a password identifier and no hasher is wired — pass options.hasher: scryptHasher(), or bunHasher() on Bun. There is no silent fallback`,
		);
	}

	const context: Context = {
		config,
		stores: guardStores(stores),
		capabilities,
		clock: options?.clock ?? systemClock,
		hasher,
		verifiers,
	};

	// The one cast at the boundary: traits were validated against C's schema
	// before any of these answers was built.
	return assemble(context) as unknown as IdentitiesOf<C>;
}

function assemble(context: Context): Identities<JsonObject, unknown> {
	const { stores, clock, config } = context;

	/** Hashed once, lazily: what a missing identity is compared against. */
	let dummy: Promise<string> | null = null;
	const dummyHash = (hasher: PasswordHasher) => {
		dummy ??= hasher.hash(`janus-dummy-${mintIdentityId()}`);
		return dummy;
	};

	const identifierOf = (type: CredentialType) =>
		config.identifiers.find((identifier) => identifier.type === type);

	return {
		async create(input) {
			const now = clock.now();
			const traits = await validateTraits(context, input.traits, 'create');
			const { identifiers, addresses } = derive(context, traits);

			let password: IdentityRecord['credentials']['password'] = null;
			if (input.password !== undefined) {
				checkPassword(context, input.password, 'create');
				password = {
					hash: await requireHasher(context, 'create').hash(input.password),
					updatedAt: now,
				};
			}

			const record: IdentityRecord = {
				id: mintIdentityId(now.getTime()),
				schemaVersion: config.schemaVersion,
				state: input.state ?? 'active',
				traits,
				identifiers,
				credentials: { password },
				addresses,
				metadataPublic: input.metadataPublic ?? {},
				metadataAdmin: input.metadataAdmin ?? {},
				version: 0,
				createdAt: now,
				updatedAt: now,
			};

			return toIdentity(await stores.identities.insertIdentity(record));
		},

		async find(id) {
			if (!isIdentityId(id)) return null;
			const record = await stores.identities.findIdentity(id);
			return record === null ? null : toIdentity(record);
		},

		async get(id) {
			return toIdentity(await getRecord(context, id, 'get'));
		},

		async findByIdentifier(type, value) {
			const identifier = identifierOf(type);
			if (identifier === undefined) {
				throw new TypeError(
					`findByIdentifier: the definition declares no ${type} identifier`,
				);
			}

			const record = await stores.identities.findIdentityByIdentifier(
				type,
				identifier.normalize(value),
			);
			return record === null ? null : toIdentity(record);
		},

		async list(page) {
			const after = page?.after ?? null;
			// Never a silent first page: a caller paging a list would loop for
			// ever, and the loop would look like a slow query.
			if (after !== null && !isIdentityId(after)) {
				throw invalidCursor('list', after);
			}

			const answer = await stores.identities.listIdentities({
				after,
				limit: pageLimit(page?.limit, 'list'),
			});
			return {
				items: answer.items.map(toIdentity),
				nextCursor: answer.nextCursor,
			};
		},

		async updateTraits(id, input, options) {
			const traits = await validateTraits(context, input, 'updateTraits');

			return writeIdentity(
				context,
				id,
				options,
				'updateTraits',
				(record) => {
					const { identifiers, addresses } = derive(
						context,
						traits,
						record?.addresses,
					);
					return {
						traits,
						identifiers,
						addresses,
						schemaVersion: config.schemaVersion,
					};
				},
				true,
			);
		},

		async setState(id, state, options) {
			return writeIdentity(
				context,
				id,
				options,
				'setState',
				() => ({ state }),
				false,
			);
		},

		async updateMetadata(id, metadata, options) {
			return writeIdentity(
				context,
				id,
				options,
				'updateMetadata',
				() => ({
					...(metadata.metadataPublic === undefined
						? {}
						: { metadataPublic: metadata.metadataPublic }),
					...(metadata.metadataAdmin === undefined
						? {}
						: { metadataAdmin: metadata.metadataAdmin }),
				}),
				false,
			);
		},

		async setAddressVerified(id, address, verified, options) {
			return writeIdentity(
				context,
				id,
				options,
				'setAddressVerified',
				(record, now) => ({
					addresses: verifiedAddresses(
						record?.addresses ?? [],
						address,
						verified,
						now,
						id,
						'setAddressVerified',
					),
				}),
				true,
			);
		},

		async setPassword(id, password, options) {
			checkPassword(context, password, 'setPassword');
			const hash = await requireHasher(context, 'setPassword').hash(password);

			return writeIdentity(
				context,
				id,
				options,
				'setPassword',
				(_, now) => ({ credentials: { password: { hash, updatedAt: now } } }),
				false,
			);
		},

		async removePassword(id, options) {
			return writeIdentity(
				context,
				id,
				options,
				'removePassword',
				(record) => {
					if (record?.credentials.password === null) {
						throw new CredentialError(
							'CREDENTIAL_MISSING',
							'removePassword: the identity has no password',
							{ identityId: id, credentialType: 'password' },
						);
					}
					return { credentials: { password: null } };
				},
				true,
			);
		},

		async verifyPassword(identifier, password) {
			const rule = identifierOf('password');
			const hasher = context.hasher;
			if (rule === undefined || hasher === null) {
				throw new TypeError(
					'verifyPassword: the definition declares no password identifier',
				);
			}

			const record = await stores.identities.findIdentityByIdentifier(
				'password',
				rule.normalize(identifier),
			);
			const credential = record?.credentials.password ?? null;

			if (record === null || credential === null) {
				// Compared all the same, so the response time does not say which
				// identifiers are registered. The store's own latency stays
				// observable; that limit is documented, not denied.
				await hasher.verify(password, await dummyHash(hasher));
				return {
					ok: false,
					reason: record === null ? 'noSuchIdentity' : 'noPasswordCredential',
				};
			}

			const verifier = context.verifiers.find((candidate) =>
				credential.hash.startsWith(candidate.prefix),
			);
			if (verifier === undefined) {
				const hashPrefix = /^\$[^$]*\$/.exec(credential.hash)?.[0] ?? '(none)';
				throw new CredentialError(
					'HASH_UNSUPPORTED',
					`verifyPassword: no wired verifier claims the prefix "${hashPrefix}"`,
					{ hashPrefix, identityId: record.id, credentialType: 'password' },
				);
			}

			if (!(await verifier.verify(password, credential.hash))) {
				return { ok: false, reason: 'wrongPassword' };
			}
			// Checked after the password, so an inactive state is only told to
			// somebody who knows it.
			if (record.state !== 'active') {
				return { ok: false, reason: 'identityInactive' };
			}

			return { ok: true, identity: toIdentity(record) };
		},

		sessions: sessionsOf(context) as Identities<JsonObject>['sessions'],
		tokens: tokensOf(context) as Identities<JsonObject>['tokens'],
		cookie: cookieOf(context),
	};
}

function cookieOf(context: Context): Identities<unknown>['cookie'] {
	const { name, domain, path, sameSite, secure } = context.config.cookie;
	const attributes = [
		`Path=${path}`,
		...(domain === null ? [] : [`Domain=${domain}`]),
		'HttpOnly',
		`SameSite=${sameSite[0]?.toUpperCase()}${sameSite.slice(1)}`,
		...(secure ? ['Secure'] : []),
	].join('; ');

	return {
		name,
		serialize: (token: string, session: Session) =>
			`${name}=${token}; Expires=${session.expiresAt.toUTCString()}; ${attributes}`,
		clear: () =>
			`${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; ${attributes}`,
	};
}
