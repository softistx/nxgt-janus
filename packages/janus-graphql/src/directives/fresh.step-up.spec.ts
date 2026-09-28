import { describe, expect, it } from 'bun:test';
import {
	ask,
	type Context,
	codes,
	type Setup,
	server,
	setup,
	users,
} from '../../test/harness';
import { requireUser } from '../helpers';

const typeDefs = /* GraphQL */ `
	type Query {
		open: String
	}
	type Mutation {
		changeEmail(email: String!): String @fresh(maxAge: 600)
		requestStepUp: String! @authenticated(type: ["patient"])
		confirmStepUp(challenge: String!, code: String!): Boolean!
			@authenticated(type: ["patient"])
	}
`;

/** The guide's mutations: `stepUp.request` and `confirm`, and a sensitive one. */
function resolversOf(context: Setup, outbox: string[]) {
	return {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Mutation: {
			changeEmail: (_: unknown, { email }: { email: string }) => email,
			requestStepUp: async (_: unknown, __: unknown, ctx: Context) => {
				const user = await requireUser(ctx, { type: 'patient' });
				const issued = await context.auth.patient.stepUp.request(user);
				outbox.push(issued.code); // sendMail(issued.email, …)
				return issued.challenge;
			},
			confirmStepUp: async (
				_: unknown,
				{ challenge, code }: { challenge: string; code: string },
				ctx: Context,
			) => {
				await context.auth.patient.stepUp.confirm(ctx.request, challenge, code);
				return true;
			},
		},
	};
}

describe('@fresh, then a step-up', () => {
	it('answers STEP_UP_REQUIRED, and the same mutation once the step-up is confirmed', async () => {
		const context = setup();
		const { ada } = await users(context);
		const outbox: string[] = [];
		const yoga = server(context, typeDefs, resolversOf(context, outbox));
		const change = 'mutation { changeEmail(email: "ada@example.org") }';
		context.clock.advance(3_600_000); // signed in an hour ago

		const refused = await ask(yoga, change, ada.token);
		expect(refused.status).toBe(403);
		expect(codes(refused.body)).toEqual(['STEP_UP_REQUIRED']);

		const requested = await ask(yoga, 'mutation { requestStepUp }', ada.token);
		const challenge = requested.body.data?.requestStepUp as string;
		const [code] = outbox;
		const confirmed = await ask(
			yoga,
			'mutation ($challenge: String!, $code: String!) { confirmStepUp(challenge: $challenge, code: $code) }',
			ada.token,
			{ challenge, code },
		);
		expect(confirmed.body).toEqual({ data: { confirmStepUp: true } });

		const again = await ask(yoga, change, ada.token);
		expect(again.body).toEqual({ data: { changeEmail: 'ada@example.org' } });

		context.clock.advance(600_000); // ten minutes after the step-up
		const later = await ask(yoga, change, ada.token);
		expect(codes(later.body)).toEqual(['STEP_UP_REQUIRED']);
	});

	it('answers a wrong code CODE_INVALID, 401, with attemptsLeft, and stamps nothing', async () => {
		const context = setup();
		const { ada } = await users(context);
		const outbox: string[] = [];
		const yoga = server(context, typeDefs, resolversOf(context, outbox));
		context.clock.advance(3_600_000);
		const requested = await ask(yoga, 'mutation { requestStepUp }', ada.token);
		const challenge = requested.body.data?.requestStepUp as string;
		const wrong = outbox[0] === '000000' ? '111111' : '000000';
		const confirmed = await ask(
			yoga,
			'mutation ($challenge: String!, $code: String!) { confirmStepUp(challenge: $challenge, code: $code) }',
			ada.token,
			{ challenge, code: wrong },
		);
		expect(confirmed.status).toBe(401);
		expect(confirmed.body.errors?.[0]?.extensions).toEqual({
			code: 'CODE_INVALID',
			attemptsLeft: 4,
		});
		const change = 'mutation { changeEmail(email: "ada@example.org") }';
		expect(codes((await ask(yoga, change, ada.token)).body)).toEqual([
			'STEP_UP_REQUIRED',
		]);
	});
});
