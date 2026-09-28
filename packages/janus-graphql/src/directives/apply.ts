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
 * The schema with every field guarded by `@authenticated`, `@fresh` or
 * `@permission` — on the field, on its type, or on an interface the type
 * implements — wrapped so its resolver runs only for a signed-in user, of
 * one of the types `type:` names when it names some, on a session that
 * proved who it is less than `maxAge` seconds ago, holding every permission
 * asked. Every directive that applies must hold.
 *
 * `useJanus()` calls it on every schema it is given. Call it yourself to
 * check a schema without a server: the guards it installs read `ctx.janus`,
 * which only `useJanus()` builds.
 *
 * **Refuses when the schema is built**, with a `TypeError` naming the
 * field: a user type `auth` does not know, a `type: []`, restrictions no
 * user type meets together, a `@fresh` whose `maxAge` is not above zero;
 * for `@permission`, an object type or a permission the model does not
 * declare, a malformed `id:`, an argument the field does not take, and a
 * loader or a condition's `ctx` it needs and was not given.
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
			const resolve = field.resolve ?? defaultFieldResolver;
			if (field.subscribe === undefined) {
				return { ...field, resolve: guarded(resolve, requirement) };
			}
			// A subscription's freshness is checked when it subscribes: its
			// events keep coming past maxAge, as its session keeps standing.
			const onEvent = { ...requirement, maxAgeMs: null };
			return {
				...field,
				subscribe: guarded(field.subscribe, requirement),
				resolve: guarded(resolve, onEvent),
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
