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
export type { Can, CheckArgs } from './model/can';
export type {
	ModelConfig,
	ObjectTypeDef,
	RelationDef,
	RuleDef,
} from './model/config';
export type { ModelTypesOf } from './model/constraint';
export type { CtxOf } from './model/ctx';
export {
	type ConfigOf,
	defineModel,
	type PermissionModel,
} from './model/define';
export {
	type FromField,
	fromField,
	type Lookup,
	type ReversibleFromField,
} from './model/from-field';
export type { Grant, GrantableOf, HolderOf } from './model/grant';
export type { List, ListPage, LookupGap } from './model/list';
export type { ObjectTypeOf, UserTypeOf } from './model/names';
export type { Permissions } from './model/permissions';
export type {
	CheckableOf,
	FieldsOf,
	ObjectRef,
	SubjectRef,
} from './model/refs';
export { type When, when } from './model/when';
export { createMemoryRelations } from './port/memory';
export type {
	ObjectPageRequest,
	RelationChanges,
	RelationStore,
} from './port/types';
