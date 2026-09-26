/**
 * `@nxgt/janus/permissions` — embedded ReBAC: Zanzibar's model without its
 * infrastructure, typed from the model the application writes.
 *
 * - `defineModel({ subjects: auth.types, types })` — object types, their
 *   relations and permissions; `fromField` reads a relation from the object's
 *   own data, `when` puts a typed condition on a rule;
 * - `permissions({ model, store })` — `can`, `list`, `grant`, `revoke`;
 * - `createMemoryRelations()` — the reference relation store, for tests.
 *
 * **The invariant, permission side.** A denial is `false`; a failure throws —
 * a store that cannot answer is `STORE_FAILED`, never a denial, and a walk
 * past `maxDepth` is `PERMISSION_DEPTH`, never a denial either.
 *
 * The subject vocabulary — `Entity`, `Subject`, `subjectOf`, the notation —
 * is exported from the root, because users need it too. An adapter author
 * checks a relation store with `describeRelationStores` from
 * `@nxgt/janus/conformance`.
 */

export { type PermissionsOptions, permissions } from './engine';
export {
	type Can,
	type CheckableOf,
	type ConfigOf,
	type CtxOf,
	defineModel,
	type FieldsOf,
	type FromField,
	fromField,
	type Grant,
	type GrantableOf,
	type HolderOf,
	type List,
	type ListPage,
	type Lookup,
	type LookupGap,
	type ModelConfig,
	type ModelTypesOf,
	type ObjectRef,
	type ObjectTypeDef,
	type ObjectTypeOf,
	type PermissionModel,
	type Permissions,
	type RelationDef,
	type ReversibleFromField,
	type RuleDef,
	type SubjectRef,
	type UserTypeOf,
	type When,
	when,
} from './model';
export { createMemoryRelations } from './port/memory';
export type {
	ObjectPageRequest,
	RelationChanges,
	RelationStore,
} from './port/types';
