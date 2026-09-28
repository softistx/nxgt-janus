/**
 * What runs before a guarded field's resolver, at request time: the user,
 * then the requirement. A denial is a `GraphQLError`; a failure to answer is
 * `SERVICE_UNAVAILABLE`, never a denial.
 */

import type { GraphQLFieldResolver } from 'graphql';
import { janusOf } from '../context';
import { denial, rethrown } from '../errors';
import type { Requirement } from './validate';

/** Refuses the request unless it meets `requirement`. */
export async function enforce(
	ctx: unknown,
	requirement: Requirement,
): Promise<void> {
	const janus = janusOf(ctx, `@authenticated on ${requirement.where}`);
	const user = await janus.user().then(undefined, rethrown);
	if (user === null) throw denial('UNAUTHENTICATED');
	if (requirement.types !== null && !requirement.types.has(user.type)) {
		throw denial('FORBIDDEN');
	}
}

/** `resolve`, run only once `requirement` is met. */
export function guarded<S, C, A>(
	resolve: GraphQLFieldResolver<S, C, A>,
	requirement: Requirement,
): GraphQLFieldResolver<S, C, A> {
	return async (source, args, ctx, info) => {
		await enforce(ctx, requirement);
		return resolve(source, args, ctx, info);
	};
}
