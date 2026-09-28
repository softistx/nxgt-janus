/**
 * One `@permission`, checked against the model and the field when the schema
 * is built, and turned into what the guard asks at request time. Everything
 * no request could pass is a `TypeError` naming the field.
 */

import type { PermissionUse } from '../read';
import { list, on, PREFIX } from '../words';
import {
	fieldsOf,
	type ModelLike,
	modelOf,
	namesOf,
	reachesCondition,
} from './model';
import { type IdPath, parsePath } from './path';

/** `useJanus({ loaders })`'s entry: the object of a type, by id, or `null`. */
export type Loader = (id: string, ctx: unknown) => unknown;
/** `useJanus({ conditions })`'s entry: the `ctx` a type's conditions test. */
export type Condition = (object: unknown, ctx: unknown) => unknown;

/** What `@permission` reads from `useJanus()`'s options. */
export interface PermissionWiring {
	readonly access?: unknown;
	readonly loaders?: { readonly [type: string]: unknown } | undefined;
	readonly conditions?: { readonly [type: string]: unknown } | undefined;
}

/** One `@permission`, as the guard asks it. */
export interface PermissionCheck {
	/** `@permission on Record (read by Record.title)`, for the messages. */
	readonly label: string;
	readonly name: string;
	readonly type: string;
	readonly onDeny: 'NOT_FOUND' | 'FORBIDDEN';
	readonly path: IdPath;
	/** Loads an object named by id alone; `null` passes `{ type, id }`. */
	readonly load: Loader | null;
	/** Answers the check's `ctx`; `null` when no condition is reachable. */
	readonly condition: Condition | null;
}

/** The field a directive is read for: `Type.field`, and the arguments it takes. */
export interface FieldShape {
	readonly name: string;
	readonly args: readonly string[];
}

/** `use`, checked, or a `TypeError` naming the field. */
export function permissionCheckOf(
	use: PermissionUse,
	field: FieldShape,
	wiring: PermissionWiring,
): PermissionCheck {
	const label = `@permission on ${on(use.where, field.name)}`;
	const refuse = (why: string) => new TypeError(`${PREFIX}: ${label} ${why}`);
	const model = modelOf(wiring.access);
	if (model === null) {
		throw refuse(
			'needs the permissions() instance — pass useJanus({ auth, access }), with access what permissions() answered',
		);
	}
	checkNames(model, use, refuse);
	const text = use.id ?? (use.onType ? 'parent.id' : 'args.id');
	const path = parsePath(text);
	if (path === null) {
		throw refuse(
			`reads its id from '${text}', which is not args.<name> or parent.<name>`,
		);
	}
	const [first] = path.segments;
	if (path.root === 'args' && !field.args.includes(first as string)) {
		throw refuse(
			`reads ${path.root}.${first}, and ${field.name} takes no argument ${first}${
				use.id === null && use.onType === false
					? ' — name the id with id: "parent.<field>" or id: "args.<name>"'
					: ''
			}`,
		);
	}
	return {
		label,
		name: use.name,
		type: use.type,
		onDeny: use.onDeny,
		path,
		load: loaderOf(model, use.type, path, wiring, refuse),
		condition: conditionOf(model, use, wiring, refuse),
	};
}

type Refuse = (why: string) => TypeError;

function checkNames(model: ModelLike, use: PermissionUse, refuse: Refuse) {
	if (!model.types.includes(use.type)) {
		throw refuse(
			`names the object type '${use.type}', which is not one of ${list(model.types)}`,
		);
	}
	const names = namesOf(model, use.type);
	if (!names.includes(use.name)) {
		throw refuse(
			`asks '${use.name}', which ${use.type} does not declare — it declares ${list(names)}`,
		);
	}
}

/** The loader a check needs: its type's, required when the object is named by id alone and reads its own fields. */
function loaderOf(
	model: ModelLike,
	type: string,
	path: IdPath,
	wiring: PermissionWiring,
	refuse: Refuse,
): Loader | null {
	const load = wiring.loaders?.[type];
	if (load !== undefined && typeof load !== 'function') {
		throw refuse(`finds loaders.${type}, which is not a function`);
	}
	const held = path.root === 'parent' && path.segments.at(-1) === 'id';
	if (held) return null;
	if (load !== undefined) return load as Loader;
	const fields = fieldsOf(model, type);
	if (fields.length > 0) {
		throw refuse(
			`reads the ${type}'s id from ${path.text}, and ${type} reads ${list(fields)} of the object itself (fromField) — pass useJanus({ loaders: { ${type}: (id, ctx) => … } })`,
		);
	}
	return null;
}

/** The type's `conditions` entry, required when the permission reaches a `when`. */
function conditionOf(
	model: ModelLike,
	use: PermissionUse,
	wiring: PermissionWiring,
	refuse: Refuse,
): Condition | null {
	if (!reachesCondition(model, use.type, use.name)) return null;
	const condition = wiring.conditions?.[use.type];
	if (typeof condition !== 'function') {
		throw refuse(
			`asks '${use.name}' of ${use.type}, which reaches a when() — pass useJanus({ conditions: { ${use.type}: (object, ctx) => … } })`,
		);
	}
	return condition as Condition;
}
