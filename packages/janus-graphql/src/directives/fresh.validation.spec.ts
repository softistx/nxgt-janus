import { describe, expect, it } from 'bun:test';
import { buildSchema } from 'graphql';
import { janusTypeDefs } from '../sdl';
import { applyJanusDirectives } from './apply';

const auth = { types: ['patient', 'staff'] };
const build = (sdl: string) =>
	applyJanusDirectives(buildSchema(janusTypeDefs + sdl), { auth });

describe('@fresh refused when the schema is built', () => {
	it('names the field of a maxAge of zero', () => {
		expect(() =>
			build('type Query { email: String @fresh(maxAge: 0) }'),
		).toThrow(
			new TypeError(
				'applyJanusDirectives(): @fresh on Query.email asks maxAge: 0 — write a number of seconds above zero, such as maxAge: 600 for ten minutes',
			),
		);
	});

	it('refuses a negative maxAge', () => {
		expect(() =>
			build('type Query { email: String @fresh(maxAge: -60) }'),
		).toThrow(/@fresh on Query\.email asks maxAge: -60/);
	});

	it('names the type and the field that reads it', () => {
		expect(() =>
			build(
				'type Query { account: Account } type Account @fresh(maxAge: 0) { email: String }',
			),
		).toThrow(/@fresh on Account \(read by Account\.email\) asks maxAge: 0/);
	});

	it('is refused by GraphQL itself without a maxAge, or with one not an Int', () => {
		expect(() => build('type Query { email: String @fresh }')).toThrow(
			/maxAge/,
		);
		expect(() =>
			build('type Query { email: String @fresh(maxAge: 1.5) }'),
		).toThrow(/maxAge/); // graphql 16 and 17 word it differently
	});

	it('guards nothing on a field no directive names', () => {
		const schema = build(
			'type Query { email: String @fresh(maxAge: 600) open: String }',
		);
		expect(schema.getQueryType()?.getFields().open?.resolve).toBeUndefined();
	});
});
