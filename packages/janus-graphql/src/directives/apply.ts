/**
 * The schema transform: every object field a directive guards gets its
 * resolver wrapped, once, when the schema is built.
 */

import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { defaultFieldResolver, type GraphQLSchema } from 'graphql';
import { guarded } from './guard';
import { readField } from './read';
import { type Known, requirementOf } from './validate';

/** What `applyJanusDirectives()` takes. */
export interface JanusDirectivesOptions<T extends string = string> {
	/** What `janus()` answered: its `types` are the names `type:` may take. */
	readonly auth: { readonly types: readonly T[] };
	/** `useJanus({ type })`'s: the one user type the schema's users can have. */
	readonly type?: T;
}

/**
 * The schema with every field guarded by `@authenticated` — on the field,
 * on its type, or on an interface the type implements — wrapped so its
 * resolver runs only for a signed-in user, of one of the types `type:`
 * names when it names some. Every directive that applies must hold.
 *
 * `useJanus()` calls it on every schema it is given. Call it yourself to
 * test a schema, or with a server that is not built on envelop.
 *
 * **Refuses when the schema is built**, with a `TypeError` naming the
 * field: a user type `auth` does not know, a `type: []`, restrictions no
 * user type meets together, and `@permission`, declared and not enforced
 * yet.
 */
export function applyJanusDirectives(
	schema: GraphQLSchema,
	options: JanusDirectivesOptions,
): GraphQLSchema {
	const known: Known = {
		types: options.type === undefined ? options.auth.types : [options.type],
	};
	return mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (field, fieldName, typeName) => {
			const requirement = requirementOf(
				`${typeName}.${fieldName}`,
				readField(schema, field, fieldName, typeName),
				known,
			);
			if (requirement === null) return field;
			return {
				...field,
				resolve: guarded(field.resolve ?? defaultFieldResolver, requirement),
				...(field.subscribe === undefined
					? {}
					: { subscribe: guarded(field.subscribe, requirement) }),
			};
		},
	});
}
