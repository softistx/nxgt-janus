import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { hasher, person } from '../../test/auth';
import { type JanusConfig, resolveConfig } from './config';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';

const store = createMemoryStores();

/** Wires from JavaScript: the types would refuse most of these first. */
const wire = (config: Record<string, unknown>) => () =>
	janus({ store, ...config } as unknown as Parameters<typeof janus>[0]);

describe('the defaults', () => {
	it('are each the strict or the usual one', () => {
		const resolved = resolveConfig(
			{ user: person, password: { login: 'email' }, store, hasher },
			'janus',
		);
		const user = resolved.types.get('user');

		expect(resolved.single).toBe(true);
		expect(user?.schemaVersion).toBe('1');
		expect(user?.password?.minLength).toBe(8);
		expect(user?.password?.normalize('  Ada@X.test ')).toBe('ada@x.test');
		expect(user?.email).toBe('email');
		expect(user?.lifespanMs).toBe(7 * 86_400_000);
		expect(user?.renewAfterMs).toBe(86_400_000);
		expect(resolved.tokenTtlMs).toEqual({
			verifyEmail: 86_400_000,
			resetPassword: 3_600_000,
			signInCode: 600_000,
		});
		expect(resolved.cookie).toEqual({
			name: 'janus-session',
			domain: null,
			path: '/',
			sameSite: 'lax',
			secure: true,
		});
	});

	it('names the one type of the single form "user", and each of the others by its key', () => {
		expect(janus({ user: person, store }).types).toEqual(['user']);
		expect(
			janus({
				users: { patient: { schema: person }, staff: { schema: person } },
				store,
			}).types,
		).toEqual(['patient', 'staff']);
	});

	it('connects to nothing: wiring never calls the store', () => {
		const untouchable = new Proxy(createMemoryStores(), {
			get: (target, slot) =>
				new Proxy(target[slot as keyof typeof target], {
					get: (inner, method) =>
						typeof inner[method as keyof typeof inner] === 'function'
							? () => {
									throw new Error(`called ${String(slot)}.${String(method)}`);
								}
							: undefined,
				}),
		});

		expect(() => janus({ user: person, store: untouchable })).not.toThrow();
	});
});

describe('refuses, with a bare TypeError, what only wiring produces', () => {
	const cases: [string, () => unknown, string][] = [
		['no user and no users', wire({}), 'pass either user'],
		[
			'both user and users',
			wire({ user: person, users: { staff: { schema: person } } }),
			'pass either user',
		],
		['an empty users', wire({ users: {} }), 'declares no user type'],
		['a schema that is not one', wire({ user: {} }), 'Standard Schema'],
		[
			'a type named like a method',
			wire({ users: { cookie: { schema: person } } }),
			'"cookie" cannot name a user type',
		],
		[
			'a type name that is not camelCase',
			wire({ users: { 'front-desk': { schema: person } } }),
			'camelCase',
		],
		[
			'a login that names no field',
			wire({ user: person, password: { login: 'e.mail' }, hasher }),
			'password.login must name a top-level field',
		],
		[
			'a login that names a field janus sets',
			wire({ user: person, password: { login: 'id' }, hasher }),
			'"id" is a field janus sets itself',
		],
		[
			'an unknown normalisation',
			wire({
				user: person,
				password: { login: 'email', normalize: 'upper' },
				hasher,
			}),
			'password.normalize',
		],
		[
			'a minimum length under 1',
			wire({
				user: person,
				password: { login: 'email', minLength: 0 },
				hasher,
			}),
			'minLength',
		],
		[
			'a password with no hasher: there is no silent fallback',
			wire({ user: person, password: { login: 'email' } }),
			'no silent fallback',
		],
		[
			'a lifespan that is not a duration',
			wire({ user: person, session: { lifespan: '30 m' } }),
			'session.lifespan',
		],
		[
			'a cookie name with a space',
			wire({ user: person, cookie: { name: 'my session' } }),
			'cookie.name',
		],
		[
			'SameSite=None without Secure',
			wire({ user: person, cookie: { sameSite: 'none', secure: false } }),
			'requires cookie.secure',
		],
		[
			'a store slot missing',
			() =>
				janus({
					user: person,
					store: { users: store.users, sessions: store.sessions },
				} as unknown as JanusConfig as never),
			'store.tokens is missing',
		],
		[
			'two hashers claiming one prefix',
			wire({ user: person, hasher, verifiers: [hasher] }),
			'two hashers claim the prefix "$scrypt$"',
		],
	];

	for (const [name, call, message] of cases) {
		it(name, () => {
			expect(call).toThrow(TypeError);
			expect(call).toThrow(message);
		});
	}

	it('names the type in the sentence when there are several', () => {
		expect(
			wire({
				users: {
					staff: { schema: z.object({ username: z.string() }), email: '' },
				},
			}),
		).toThrow('janus: users.staff: email must name a top-level field');
	});
});
