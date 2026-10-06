/**
 * Reads the directives that apply to one object field: its own, its object
 * type's, and those of every interface the type implements — on the
 * interface itself and on the interface's field of the same name. Reads, and
 * decides nothing: `validate.ts` decides what they add up to.
 */

import { getDirective } from '@graphql-tools/utils';
import type {
	GraphQLFieldConfig,
	GraphQLInterfaceType,
	GraphQLObjectType,
	GraphQLSchema,
} from 'graphql';

/** One `@authenticated`, and where it was written. */
export interface AuthenticatedUse {
	/** `Type.field`, `Type`, `Interface.field` or `Interface`. */
	readonly where: string;
	/** Its `type:` argument, or `null` when it names none: any signed-in user. */
	readonly types: readonly string[] | null;
}

/** One `@fresh`, and where it was written. */
export interface FreshUse {
	/** `Type.field`, `Type`, `Interface.field` or `Interface`. */
	readonly where: string;
	/** Its `maxAge:` argument, in seconds, as written: checked by `validate.ts`. */
	readonly maxAge: number;
}

/** One `@permission`, as written, and where. */
export interface PermissionUse {
	/** `Type.field`, `Type`, `Interface.field` or `Interface`. */
	readonly where: string;
	/** Written on a type or an interface, rather than on a field. */
	readonly onType: boolean;
	readonly name: string;
	readonly type: string;
	/** Its `id:` argument, or `null` when absent. */
	readonly id: string | null;
	readonly onDeny: 'NOT_FOUND' | 'FORBIDDEN';
}

/** Everything written on one field's locations. */
export interface FieldDirectives {
	readonly authenticated: readonly AuthenticatedUse[];
	readonly fresh: readonly FreshUse[];
	/** In the order they are checked: the type's and interfaces' first, then the field's. */
	readonly permission: readonly PermissionUse[];
}

type Located = {
	readonly where: string;
	readonly onType: boolean;
	readonly node: Parameters<typeof getDirective>[1];
};

/**
 * The locations whose directives apply to `typeName.fieldName`, outermost
 * first: the interfaces, the type, the interfaces' fields, the field. A
 * `@permission` on the object a field belongs to is asked before the one on
 * the field, so a field's `FORBIDDEN` never answers for an object its type
 * would have answered `NOT_FOUND` for.
 */
function locations(
	schema: GraphQLSchema,
	field: GraphQLFieldConfig<unknown, unknown>,
	fieldName: string,
	typeName: string,
): Located[] {
	const type = schema.getType(typeName) as GraphQLObjectType;
	const faces = type.getInterfaces() as readonly GraphQLInterfaceType[];
	const fields: Located[] = [];
	for (const face of faces) {
		const own = face.getFields()[fieldName];
		if (own !== undefined) {
			fields.push({
				where: `${face.name}.${fieldName}`,
				onType: false,
				node: own,
			});
		}
	}
	return [
		...faces.map((face) => ({ where: face.name, onType: true, node: face })),
		{ where: typeName, onType: true, node: type },
		...fields,
		{ where: `${typeName}.${fieldName}`, onType: false, node: field },
	];
}

/** Every `@authenticated`, `@fresh` and `@permission` that applies to one object field. */
export function readField(
	schema: GraphQLSchema,
	field: GraphQLFieldConfig<unknown, unknown>,
	fieldName: string,
	typeName: string,
): FieldDirectives {
	const authenticated: AuthenticatedUse[] = [];
	const fresh: FreshUse[] = [];
	const permission: PermissionUse[] = [];
	for (const { where, onType, node } of locations(
		schema,
		field,
		fieldName,
		typeName,
	)) {
		for (const args of getDirective(schema, node, 'authenticated') ?? []) {
			const types = args['type'] as readonly string[] | null | undefined;
			authenticated.push({ where, types: types ?? null });
		}
		for (const args of getDirective(schema, node, 'fresh') ?? []) {
			fresh.push({ where, maxAge: args['maxAge'] as number });
		}
		for (const args of getDirective(schema, node, 'permission') ?? []) {
			permission.push({
				where,
				onType,
				name: args['name'] as string,
				type: args['type'] as string,
				id: (args['id'] as string | null | undefined) ?? null,
				onDeny: args['onDeny'] === 'FORBIDDEN' ? 'FORBIDDEN' : 'NOT_FOUND',
			});
		}
	}
	return { authenticated, fresh, permission };
}
