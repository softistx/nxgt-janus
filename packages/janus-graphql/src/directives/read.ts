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

/** Everything written on one field's locations. */
export interface FieldDirectives {
	readonly authenticated: readonly AuthenticatedUse[];
	/** Where a `@permission` was written: refused until it is enforced. */
	readonly permission: readonly string[];
}

type Located = {
	readonly where: string;
	readonly node: Parameters<typeof getDirective>[1];
};

/** The locations whose directives apply to `typeName.fieldName`, field first. */
function locations(
	schema: GraphQLSchema,
	field: GraphQLFieldConfig<unknown, unknown>,
	fieldName: string,
	typeName: string,
): Located[] {
	const type = schema.getType(typeName) as GraphQLObjectType;
	const found: Located[] = [
		{ where: `${typeName}.${fieldName}`, node: field },
		{ where: typeName, node: type },
	];
	for (const face of type.getInterfaces() as readonly GraphQLInterfaceType[]) {
		const own = face.getFields()[fieldName];
		if (own !== undefined) {
			found.push({ where: `${face.name}.${fieldName}`, node: own });
		}
		found.push({ where: face.name, node: face });
	}
	return found;
}

/** Every `@authenticated` and `@permission` that applies to one object field. */
export function readField(
	schema: GraphQLSchema,
	field: GraphQLFieldConfig<unknown, unknown>,
	fieldName: string,
	typeName: string,
): FieldDirectives {
	const authenticated: AuthenticatedUse[] = [];
	const permission: string[] = [];
	for (const { where, node } of locations(schema, field, fieldName, typeName)) {
		for (const args of getDirective(schema, node, 'authenticated') ?? []) {
			const types = args.type as readonly string[] | null | undefined;
			authenticated.push({ where, types: types ?? null });
		}
		if ((getDirective(schema, node, 'permission') ?? []).length > 0) {
			permission.push(where);
		}
	}
	return { authenticated, permission };
}
