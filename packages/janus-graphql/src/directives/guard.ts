/**
 * What runs before a guarded field's resolver, at request time: the user,
 * then the requirement — its user types, then each `@permission` in order. A
 * denial is a `GraphQLError`; a failure to answer is `SERVICE_UNAVAILABLE`,
 * never a denial.
 */

import type { GraphQLFieldResolver } from 'graphql';
import { checkOf, janusOf } from '../context';
import { denial, rethrown } from '../errors';
import { enforcePermission } from './permission/enforce';
import type { Requirement } from './validate';

/** What the field was asked with. */
export interface Resolving {
	readonly parent: unknown;
	readonly args: unknown;
	readonly ctx: unknown;
	/** A subscription's: its checks skip the request's memo, and see a revoke. */
	readonly fresh: boolean;
}

/** Refuses the request unless it meets `requirement`. */
export async function enforce(
	requirement: Requirement,
	{ parent, args, ctx, fresh }: Resolving,
): Promise<void> {
	const janus = janusOf(ctx, requirement.label);
	const user = await janus.user().then(undefined, rethrown);
	if (user === null) throw denial('UNAUTHENTICATED');
	if (requirement.types !== null && !requirement.types.has(user.type)) {
		throw denial('FORBIDDEN');
	}
	const [first] = requirement.permissions;
	if (first === undefined) return;
	const check = checkOf(janus, fresh);
	if (check === null) {
		throw new TypeError(
			`${first.label}: ctx.janus.access is not set — pass { access } to useJanus()`,
		);
	}
	// In order, one at a time: the first that denies answers, and the ones
	// after it are never asked.
	for (const permission of requirement.permissions) {
		await enforcePermission(permission, { check, user, parent, args, ctx });
	}
}

/** `resolve`, run only once `requirement` is met. */
export function guarded<S, C, A>(
	resolve: GraphQLFieldResolver<S, C, A>,
	requirement: Requirement,
): GraphQLFieldResolver<S, C, A> {
	return async (source, args, ctx, info) => {
		await enforce(requirement, {
			parent: source,
			args,
			ctx,
			fresh: info.operation.operation === 'subscription',
		});
		return resolve(source, args, ctx, info);
	};
}
