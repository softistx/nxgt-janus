import { describe, expect, it } from 'bun:test';
import type { GraphQLError } from 'graphql';
import { type Setup, setup, users } from '../test/harness';
import { createJanusContext } from './context';
import { can, requireUser } from './helpers';

function contextOf({ auth, access }: Setup, token?: string) {
	const request = new Request('http://yoga.test/graphql', {
		headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
	});
	return { janus: createJanusContext(request, { auth, access }) } as {
		readonly janus: {
			user(): Promise<Awaited<ReturnType<Setup['auth']['getUser']>> | null>;
			readonly access: Setup['access'];
		};
	};
}

/** What a promise rejected with, or `null` when it did not. */
const rejection = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(error: unknown) => error,
	);

describe('requireUser()', () => {
	it('answers the signed-in user', async () => {
		const context = setup();
		const { ada } = await users(context);
		const user = await requireUser(contextOf(context, ada.token));
		expect(user.id).toBe(ada.user.id);
	});

	it('answers the user of the type it names, and refuses another FORBIDDEN', async () => {
		const context = setup();
		const { ada, grace } = await users(context);
		const staff = await requireUser(contextOf(context, grace.token), {
			type: 'staff',
		});
		expect(staff.username).toBe('grace');

		const refused = await rejection(
			requireUser(contextOf(context, ada.token), { type: 'staff' }),
		);
		expect((refused as GraphQLError).extensions).toEqual({
			code: 'FORBIDDEN',
			http: { status: 403 },
		});
	});

	it('admits a user of any type a list names', async () => {
		const context = setup();
		const { ada } = await users(context);
		const user = await requireUser(contextOf(context, ada.token), {
			type: ['staff', 'patient'],
		});
		expect(user.type).toBe('patient');
	});

	it('refuses an anonymous request UNAUTHENTICATED', async () => {
		const refused = await rejection(requireUser(contextOf(setup())));
		expect((refused as GraphQLError).extensions?.code).toBe('UNAUTHENTICATED');
	});

	it('refuses with a TypeError a context useJanus() did not build', async () => {
		const refused = await rejection(requireUser({} as never));
		expect(refused).toBeInstanceOf(TypeError);
		expect((refused as Error).message).toBe(
			'requireUser(): ctx.janus is not set — add useJanus({ auth }) to the plugins',
		);
	});

	it('refuses with a TypeError an empty list of types, before authenticating', async () => {
		const context = setup();
		const { ada } = await users(context);
		for (const token of [ada.token, undefined]) {
			const refused = await rejection(
				requireUser(contextOf(context, token), { type: [] as never }),
			);
			expect(refused).toBeInstanceOf(TypeError);
			expect((refused as Error).message).toBe(
				'requireUser(): type is an empty list, which no user could pass — name at least one user type, or leave type out',
			);
		}
	});
});

describe('can()', () => {
	const record = { type: 'record', id: 'r1', doctorId: null } as const;

	it("answers what access.can answers for the request's user", async () => {
		const context = setup();
		const { ada, grace } = await users(context);
		await context.access.grant(record, 'owners', ada.user);

		expect(await can(contextOf(context, ada.token), 'view', record)).toBe(true);
		expect(await can(contextOf(context, grace.token), 'view', record)).toBe(
			false,
		);
		expect(
			await can(contextOf(context, ada.token), 'edit', record, {
				ctx: { locked: true },
			}),
		).toBe(false);
	});

	it('answers false for an anonymous request', async () => {
		expect(await can(contextOf(setup()), 'view', record)).toBe(false);
	});

	it('asks access.can on a context built by hand', async () => {
		const context = setup();
		const { ada } = await users(context);
		await context.access.grant(record, 'owners', ada.user);
		const janus = {
			user: async () => ada.user,
			session: async () => ada.session,
			access: context.access,
		};
		expect(await can({ janus }, 'view', record)).toBe(true);
	});

	it('refuses with a TypeError a context with no access', async () => {
		const context = setup();
		const janus = createJanusContext(new Request('http://yoga.test/'), {
			auth: context.auth,
		});
		const refused = await rejection(
			can({ janus } as unknown as ReturnType<typeof contextOf>, 'view', record),
		);
		expect(refused).toBeInstanceOf(TypeError);
		expect((refused as Error).message).toContain(
			'pass { access } to useJanus()',
		);
	});
});
