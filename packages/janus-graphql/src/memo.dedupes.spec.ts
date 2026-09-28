import { describe, expect, it } from 'bun:test';
import { ask, type Context } from '../test/harness';
import { wards, wired } from './directives/permission.fixtures';
import { can } from './helpers';
import { memoized } from './memo';

const typeDefs = /* GraphQL */ `
	type Query {
		ward(id: ID!): String @permission(name: "enter", type: "ward")
		door(id: ID!): String @permission(name: "enter", type: "ward")
		asked(id: ID!): Boolean
		editable: Boolean
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		ward: (_: unknown, { id }: { id: string }) => id,
		door: (_: unknown, { id }: { id: string }) => id,
		asked: (_: unknown, { id }: { id: string }, ctx: Context) =>
			can(ctx, 'enter', { type: 'ward', id }),
		editable: (_: unknown, __: unknown, ctx: Context) =>
			can(
				ctx,
				'edit',
				{ type: 'record', id: 'r1', doctorId: null },
				{ ctx: { locked: false } },
			),
	},
};

async function setUp() {
	const w = await wired(typeDefs, resolvers);
	await wards(w);
	return w;
}

describe('the per-request memo', () => {
	it('asks the same question once for two fields, however they are aliased', async () => {
		const { yoga, grace, asked, calls } = await setUp();
		const has = calls.has;
		const { body } = await ask(
			yoga,
			'{ a: ward(id: "w1") b: ward(id: "w1") door(id: "w1") }',
			grace.token,
		);
		expect(body).toEqual({ data: { a: 'w1', b: 'w1', door: 'w1' } });
		expect(asked.can).toBe(1);
		expect(calls.has - has).toBe(1);
	});

	it("shares a directive's answer with a resolver's can()", async () => {
		const { yoga, grace, asked } = await setUp();
		const { body } = await ask(
			yoga,
			'{ ward(id: "w2") asked(id: "w2") }',
			grace.token,
		);
		expect(body).toEqual({ data: { ward: 'w2', asked: true } });
		expect(asked.can).toBe(1);
	});

	it('asks another object, and another request, again', async () => {
		const { yoga, grace, asked } = await setUp();
		await ask(yoga, '{ a: ward(id: "w1") b: ward(id: "w2") }', grace.token);
		expect(asked.can).toBe(2);
		await ask(yoga, '{ ward(id: "w1") }', grace.token);
		expect(asked.can).toBe(3);
	});

	it("never remembers a check with a condition's ctx", async () => {
		const { yoga, ada, access, asked } = await setUp();
		await access.grant({ type: 'record', id: 'r1' }, 'owners', ada.user);
		const { body } = await ask(yoga, '{ a: editable b: editable }', ada.token);
		expect(body).toEqual({ data: { a: true, b: true } });
		expect(asked.can).toBe(2);
	});
});

describe('memoized()', () => {
	const subject = { type: 'staff', id: 'u1' };
	const ward = { type: 'ward', id: 'w1' };

	/** An `access` whose `can` answers what `answer` does, counting its calls. */
	function counted(answer: () => Promise<boolean>) {
		const calls = { count: 0 };
		const access = {
			can: () => {
				calls.count++;
				return answer();
			},
		};
		return { check: memoized(access), calls };
	}

	it('shares one promise between two identical checks asked at once', () => {
		const { check, calls } = counted(() => Promise.resolve(true));
		const first = check(subject, 'enter', ward);
		expect(check(subject, 'enter', ward)).toBe(first);
		expect(calls.count).toBe(1);
	});

	it('does not remember a failure: the next check asks again', async () => {
		let down = true;
		const { check, calls } = counted(() =>
			down ? Promise.reject(new Error('down')) : Promise.resolve(true),
		);
		const failed = await check(subject, 'enter', ward).then(
			() => null,
			(error: unknown) => error,
		);
		expect(failed).toBeInstanceOf(Error);
		down = false;
		expect(await check(subject, 'enter', ward)).toBe(true);
		expect(calls.count).toBe(2);
	});

	it('asks every time for an anonymous subject, or an id the notation reads two ways', async () => {
		const { check, calls } = counted(() => Promise.resolve(false));
		await check(null, 'enter', ward);
		await check(null, 'enter', ward);
		await check(subject, 'enter', { type: 'ward', id: 'w1#nurses' });
		await check(subject, 'enter', { type: 'ward', id: 'w1#nurses' });
		await check({ type: 'staff', id: 'u@1' }, 'enter', ward);
		await check({ type: 'staff', id: 'u@1' }, 'enter', ward);
		expect(calls.count).toBe(6);
	});

	it('calls can with access as this', async () => {
		const access = {
			answer: true,
			can(this: { answer: boolean }) {
				return Promise.resolve(this.answer);
			},
		};
		expect(await memoized(access)(subject, 'enter', ward)).toBe(true);
	});
});
