import { guardRelations } from '../stores/guard';
import { systemClock } from '../time/clock';
import { type JanusConfig, resolveConfig } from './config';
import { createContext } from './context';
import { guardStores } from './outage';
import { assertStores } from './port/assert-stores';
import { sharedApi } from './sessions';
import type { Checked, Janus } from './types';
import { typeApi } from './users';

/**
 * Wires the identities side over the stores the application opened. **Synchronous,
 * and does no I/O**: it connects to nothing.
 *
 * ```ts
 * // One user type
 * const auth = janus({
 *   user: z.object({ email: z.email(), name: z.string() }),
 *   password: { login: 'email' },
 *   store: createMemoryStores(),
 *   hasher: scryptHasher(),
 * });
 * const { user, token } = await auth.signUp({ email, name, password });
 *
 * // Several
 * const auth = janus({
 *   users: {
 *     patient: { schema: Patient, password: { login: 'email' } },
 *     staff: { schema: Staff, password: { login: 'email' }, session: { lifespan: '8h' } },
 *   },
 *   store, hasher,
 * });
 * await auth.staff.signIn({ email, password });
 * const current = await auth.authenticate(request, { type: 'staff' });
 * ```
 *
 * The types refuse first, on the offending key: a login or an e-mail that
 * names no required string field, a schema declaring a field `janus` sets, a
 * user type named like a method. What follows at run time is the net for
 * JavaScript callers, each a bare `TypeError` because only wiring produces one:
 * a store slot missing or incomplete; a password type with no hasher — there
 * is no silent fallback; two hashers claiming the same prefix, which would make
 * verification depend on the order they were listed in.
 */
export function janus<const C extends JanusConfig>(
	config: C & Checked<C>,
): Janus<C> {
	const where = 'janus';
	const resolved = resolveConfig(config, where);
	const capabilities = assertStores(config.store, where);

	const hasher = config.hasher ?? null;
	const verifiers = [
		...(hasher === null ? [] : [hasher]),
		...(config.verifiers ?? []),
	];
	const prefixes = new Set<string>();
	for (const verifier of verifiers) {
		if (typeof verifier?.prefix !== 'string' || verifier.prefix === '') {
			throw new TypeError(`${where}: every hasher needs a non-empty prefix`);
		}
		if (prefixes.has(verifier.prefix)) {
			throw new TypeError(
				`${where}: two hashers claim the prefix "${verifier.prefix}" — which one verifies would depend on their order`,
			);
		}
		prefixes.add(verifier.prefix);
	}

	const relations = config.relations ?? null;
	if (
		relations !== null &&
		typeof (relations as { deleteEntity?: unknown }).deleteEntity !== 'function'
	) {
		throw new TypeError(
			`${where}: relations must be a relation store — relations.deleteEntity is missing`,
		);
	}

	const context = createContext(
		resolved,
		guardStores(config.store),
		relations === null ? null : guardRelations(relations),
		capabilities,
		config.clock ?? systemClock,
		hasher,
		verifiers,
	);

	const shared = sharedApi(context);
	const types = Object.fromEntries(
		[...resolved.types.values()].map((type) => [
			type.name,
			typeApi(context, type),
		]),
	);

	// The one cast at the boundary: every field was validated against its
	// type's schema before any of these answers was built.
	const surface = resolved.single
		? { ...shared, ...types.user }
		: { ...shared, ...types };
	return surface as unknown as Janus<C>;
}
