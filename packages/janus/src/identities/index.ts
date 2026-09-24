/**
 * `@nxgt/janus/identities` — the identity core, and the port it runs over.
 *
 * ```ts
 * const definition = defineIdentities({ traits, identifiers: { … } });
 * const identities = createIdentities(definition, stores, { hasher });
 * ```
 *
 * `defineIdentities` describes; `createIdentities` assembles, synchronously and
 * with no I/O. Everything else reaches a store, and so is asynchronous — and
 * every one of those calls keeps the rule this package is built around: **an
 * absence is `null`, a failure throws.**
 */

export { requireAal } from './aal';
export { createIdentities } from './create';
export { defineIdentities } from './define';
export { bunHasher, scryptHasher } from './hashers';
export { assertStores } from './port/assert-stores';
export { createMemoryStores } from './port/memory';
export type {
	AddressChannel,
	AuthenticatorAssuranceLevel,
	CredentialType,
	IdentityCredentials,
	IdentityIdentifier,
	IdentityPageRequest,
	IdentityPatch,
	IdentityRecord,
	IdentityState,
	IdentityStore,
	IdentityStores,
	Json,
	JsonObject,
	PasswordCredential,
	SessionId,
	SessionRecord,
	SessionStore,
	StoreCapabilities,
	TokenKind,
	TokenRecord,
	TokenStore,
	VerifiableAddress,
} from './port/types';
export type { StandardSchemaV1 } from './standard-schema';
export type {
	Checked,
	CodeIdentifierConfig,
	CookieConfig,
	HeaderSource,
	IdentifierConfig,
	Identities,
	IdentitiesConfig,
	IdentitiesDefinition,
	IdentitiesOf,
	IdentitiesOptions,
	Identity,
	IssuedSession,
	Normalize,
	PasswordHasher,
	PasswordRefusal,
	PasswordVerification,
	Resolved,
	Session,
	StringLeaves,
	TraitsInputOf,
	TraitsJson,
	TraitsOf,
	WriteOptions,
} from './types';
