/**
 * The schema transform: every object field a directive guards gets its
 * resolver wrapped, once, when the schema is built.
 */

import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { defaultFieldResolver, type GraphQLSchema } from 'graphql';
import { guarded } from './guard';
import { readField } from './read';
import { type Known, requirementOf } from './validate';
import { list, PREFIX } from './words';

type Entries = {
	readonly [type: string]: ((...args: never[]) => unknown) | undefined;
};

/** What `applyJanusDirectives()` takes. */
export interface JanusDirectivesOptions<T extends string = string> {
	/** What `janus()` answered: its `types` are the names `type:` may take. */
	readonly auth: { readonly types: readonly T[] };
	/** `useJanus({ type })`'s: the one user type the schema's users can have. */
	readonly type?: NoInfer<T>;
	/** What `permissions()` answered: its model is what `@permission` may name. Required once a schema uses it. */
	readonly access?: { readonly model: unknown } | undefined;
	/** `useJanus({ loaders })`'s. */
	readonly loaders?: Entries | undefined;
	/** `useJanus({ conditions })`'s. */
	readonly conditions?: Entries | undefined;
}

/**
 * The schema with every field guarded by `@authenticated` or `@permission`
 * — on the field, on its type, or on an interface the type implements —
 * wrapped so its resolver runs only for a signed-in user, of one of the
 * types `type:` names when it names some, holding every permission asked.
 * Every directive that applies must hold.
 *
 * `useJanus()` calls it on every schema it is given. Call it yourself to
 * check a schema without a server: the guards it installs read `ctx.janus`,
 * which only `useJanus()` builds.
 *
 * **Refuses when the schema is built**, with a `TypeError` naming the
 * field: a user type `auth` does not know, a `type: []`, restrictions no
 * user type meets together; for `@permission`, an object type or a
 * permission the model does not declare, a malformed `id:`, an argument the
 * field does not take, and a loader or a condition's `ctx` it needs and was
 * not given.
 */
export function applyJanusDirectives<const T extends string>(
	schema: GraphQLSchema,
	options: JanusDirectivesOptions<T>,
): GraphQLSchema {
	const known = knownOf(options);
	return mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (field, fieldName, typeName) => {
			const requirement = requirementOf(
				{
					name: `${typeName}.${fieldName}`,
					args: Object.keys(field.args ?? {}),
				},
				readField(schema, field, fieldName, typeName),
				known,
				options,
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

/** The user types a directive may name — `type` alone when it is given, and one of `auth.types`. */
function knownOf({ auth, type }: JanusDirectivesOptions): Known {
	if (type === undefined) return { types: auth.types };
	if (!auth.types.includes(type)) {
		throw new TypeError(
			`${PREFIX}: type '${type}' is not a user type of auth — it knows ${list(auth.types)}`,
		);
	}
	return { types: [type] };
}
