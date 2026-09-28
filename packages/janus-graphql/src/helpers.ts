/**
 * The two calls a resolver makes itself: `requireUser` where a directive
 * would not do, and `can` for a check the schema cannot express.
 */

import type {
	CheckArgs,
	CheckableOf,
	ModelConfig,
	ObjectRef,
	ObjectTypeOf,
	Permissions,
} from '@nxgt/janus/permissions';
import { checkOf, janusOf } from './context';
import { denial, rethrown } from './errors';

/** What `requireUser()` takes. */
export interface RequireUserOptions<T extends string> {
	/**
	 * Only a user of this type, or of one of these — never an empty list,
	 * which no user could pass: any other is `FORBIDDEN`.
	 */
	readonly type?: T | readonly [T, ...T[]];
}

/**
 * The signed-in user, narrowed to `type` when it is given — or a denial:
 * `UNAUTHENTICATED` 401 for an anonymous request, `FORBIDDEN` 403 for a user
 * of another type. A store that cannot answer is `SERVICE_UNAVAILABLE` 503,
 * never either of them.
 *
 * ```ts
 * const staff = await requireUser(ctx, { type: 'staff' });
 * staff.username; // typed: a staff member
 * ```
 */
export async function requireUser<
	U extends { readonly type: string },
	const T extends U['type'] = U['type'],
>(
	ctx: { readonly janus: { user(): Promise<U | null> } },
	options: RequireUserOptions<T> = {},
): Promise<Extract<U, { readonly type: T }>> {
	const { type } = options;
	const allowed: readonly string[] | undefined =
		typeof type === 'string' ? [type] : type;
	if (allowed?.length === 0) {
		throw new TypeError(
			'requireUser(): type is an empty list, which no user could pass — name at least one user type, or leave type out',
		);
	}
	const user = await janusOf(ctx, 'requireUser()')
		.user()
		.then(undefined, rethrown);
	if (user === null) throw denial('UNAUTHENTICATED');
	if (allowed !== undefined && !allowed.includes(user.type)) {
		throw denial('FORBIDDEN');
	}
	return user as unknown as Extract<U, { readonly type: T }>;
}

/**
 * Whether the request's user holds `permission` on `object`, typed as
 * `access.can` is: the permission must be one the object's type declares,
 * the object must carry every field its `fromField`s read, and `{ ctx }` is
 * required exactly when a condition is reachable. Anonymous answers `false`.
 *
 * **A failure throws**: a store that cannot answer is `SERVICE_UNAVAILABLE`
 * 503, never `false`.
 *
 * ```ts
 * if (!(await can(ctx, 'edit', { type: 'record', ...record }))) return null;
 * ```
 */
export async function can<
	C extends ModelConfig,
	const T extends ObjectTypeOf<C>,
	const P extends CheckableOf<C, T>,
>(
	ctx: {
		readonly janus: {
			user(): Promise<{ readonly type: string; readonly id: string } | null>;
			readonly access: Pick<Permissions<C>, 'can'>;
		};
	},
	permission: P,
	object: ObjectRef<C, T>,
	...options: CheckArgs<C, T, P>
): Promise<boolean> {
	const janus = janusOf(ctx, 'can()');
	const check = checkOf(janus);
	if (check === null) {
		throw new TypeError(
			'can(): ctx.janus.access is not set — pass { access } to useJanus()',
		);
	}
	const subject = await janus.user().then(undefined, rethrown);
	return check(subject, permission, object, options[0]).then(
		undefined,
		rethrown,
	);
}
