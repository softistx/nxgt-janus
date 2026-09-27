/**
 * The permission model: which object types exist, which relations they hold,
 * and which permissions those relations grant — written in TypeScript, and
 * typed from itself.
 *
 * **ReBAC, embedded.** Zanzibar's data model — relations between objects and
 * subjects, permissions computed from them — without its infrastructure: the
 * database is the application's own, so reads follow writes and there is
 * nothing to cache or sequence. Two things go beyond Zanzibar's descendants:
 *
 * - **`fromField`**, a relation read from the object's own data — a record's
 *   `doctorId` — rather than a tuple to keep in sync with it. Two sources of
 *   truth for one fact is the first trap of a Zanzibar deployment;
 * - **`when`**, a condition written in TypeScript and typed: its `ctx` is what
 *   `can()` then requires, and only for the permissions whose rules reach it.
 *
 * The model is a flat `const` literal, and everything the compiler can check
 * about it is checked by `ModelTypesOf`, in `./constraint`: a relation naming
 * a subject type that does not exist, a permission naming a relation that does
 * not exist, an arrow to a permission its target does not have. What only
 * running it can check —
 * names, cycles — is refused by {@link defineModel} with a `TypeError`.
 */

import { resolveModel } from '../resolve/resolve-model';
import type { ResolvedModel } from '../resolve/resolved';
import type { ModelConfig } from './config';
import type { ModelTypesOf } from './constraint';
import type { ObjectTypeOf, UserTypeOf } from './names';

/** A model, checked and resolved. What `permissions()` will take. */
export interface PermissionModel<C extends ModelConfig = ModelConfig> {
	/** The user types it accepts as subjects. */
	readonly subjects: readonly UserTypeOf<C>[];
	/** The object types it declares. */
	readonly types: readonly ObjectTypeOf<C>[];
	/** The definition, as written — the very object passed to defineModel. */
	readonly definition: C;
}

/** The configuration a model was defined from. */
export type ConfigOf<M> = M extends PermissionModel<infer C> ? C : never;

// Keyed by the frozen model itself: nothing outside this module can reach it.
const RESOLVED = new WeakMap<object, ResolvedModel>();

/**
 * Checks a model and resolves it. Connects to nothing.
 *
 * ```ts
 * export const model = defineModel({
 *   subjects: auth.types,
 *   types: {
 *     team: {
 *       related: { members: ['staff', 'team#members'], leads: ['staff'] },
 *       permits: { manage: ['leads'], view: ['members', 'manage'] },
 *     },
 *     record: {
 *       related: {
 *         doctors: fromField('doctorId', 'staff'),
 *         teams: ['team'],
 *       },
 *       permits: {
 *         view: ['doctors', 'teams->view'],
 *         edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * Refuses with a `TypeError` what only running it can see: a name that is not
 * camelCase, a permission that reaches itself without crossing a relation —
 * which no data could ever end. A user type may also be an object type: its
 * users are then objects too, and a set on it is written with `setOf()`.
 */
export function defineModel<
	const Subjects extends readonly string[],
	const Ts extends ModelConfig['types'] & ModelTypesOf<Subjects[number], Ts>,
>(config: {
	readonly subjects: Subjects;
	readonly types: Ts;
}): PermissionModel<{ readonly subjects: Subjects; readonly types: Ts }>;
export function defineModel<const C extends ModelConfig>(
	config: C,
): PermissionModel<C> {
	const resolved = resolveModel(config, 'defineModel');
	const model: PermissionModel<C> = Object.freeze({
		subjects: [...resolved.subjects] as UserTypeOf<C>[],
		types: [...resolved.types.keys()] as ObjectTypeOf<C>[],
		definition: config,
	});
	RESOLVED.set(model, resolved);
	return model;
}

/** The resolved form of a model this module defined. Internal. */
export function resolvedOf(model: object): ResolvedModel {
	const resolved = RESOLVED.get(model);
	if (resolved === undefined) {
		throw new TypeError(
			'permissions: this model was not made by defineModel() — pass what defineModel() answered',
		);
	}
	return resolved;
}
