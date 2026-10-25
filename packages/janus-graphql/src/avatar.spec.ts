import { describe, expect, it } from 'bun:test';
import { graphql } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { avatarResolvers, toJanusAvatar } from './avatar';
import { janusAvatarTypeDefs } from './avatar.sdl';

const typeDefs = /* GraphQL */ `
	type Viewer {
		name: String!
		avatar: JanusAvatar
	}
	type Query {
		viewer(id: String!): Viewer!
	}
`;

const at = new Date('2026-10-24T08:30:00.000Z');
const ada = { id: 'u1', name: 'Ada', avatar: { id: 'img-1', updatedAt: at } };
const bob = { id: 'u2', name: 'Bob', avatar: null };

/** A schema whose url points at an app route, and records what it was asked. */
function schemaOf(asked: unknown[] = []) {
	return createSchema({
		typeDefs: [janusAvatarTypeDefs, typeDefs],
		resolvers: {
			...avatarResolvers({
				url: (avatar, size) => {
					asked.push([avatar, size]);
					return `/avatars/${avatar.userId}/${size}?v=${avatar.id}`;
				},
			}),
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Query: {
				viewer: (_: unknown, { id }: { id: string }) =>
					id === 'u1' ? ada : bob,
			},
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Viewer: { avatar: (user: typeof ada) => toJanusAvatar(user) },
		},
	});
}

const run = (source: string, schema = schemaOf()) =>
	graphql({ schema, source });

describe('janusAvatarTypeDefs', () => {
	it('is graphql/janus-avatar.graphqls, byte for byte', async () => {
		const shipped = await Bun.file(
			new URL('../graphql/janus-avatar.graphqls', import.meta.url),
		).text();
		expect(janusAvatarTypeDefs).toBe(shipped);
	});
});

describe('toJanusAvatar', () => {
	it('is null for a user with no avatar', () => {
		expect(toJanusAvatar(bob)).toBeNull();
	});

	it('carries the owner, the id and the date', () => {
		expect(toJanusAvatar(ada)).toEqual({
			userId: 'u1',
			id: 'img-1',
			updatedAt: at,
		});
	});
});

describe('avatarResolvers', () => {
	it('answers id, updatedAt as ISO-8601 and the url of the application route', async () => {
		const asked: unknown[] = [];
		const result = await run(
			'{ viewer(id: "u1") { avatar { id updatedAt url(size: 64) } } }',
			schemaOf(asked),
		);
		expect(result).toEqual({
			data: {
				viewer: {
					avatar: {
						id: 'img-1',
						updatedAt: '2026-10-24T08:30:00.000Z',
						url: '/avatars/u1/64?v=img-1',
					},
				},
			},
		});
		expect(asked).toEqual([[{ userId: 'u1', id: 'img-1', updatedAt: at }, 64]]);
	});

	it('answers null for a user with no avatar', async () => {
		expect(await run('{ viewer(id: "u2") { avatar { id } } }')).toEqual({
			data: { viewer: { avatar: null } },
		});
	});

	it.each(['0', '-1'])(
		'refuses size %s as BAD_USER_INPUT, 400, without asking url',
		async (size) => {
			const asked: unknown[] = [];
			const result = await run(
				`{ viewer(id: "u1") { avatar { url(size: ${size}) } } }`,
				schemaOf(asked),
			);
			const [error] = result.errors ?? [];
			expect(error?.message).toBe('size must be a positive integer');
			expect(error?.extensions).toEqual({
				code: 'BAD_USER_INPUT',
				http: { status: 400 },
			});
			expect(asked).toEqual([]);
		},
	);

	it('refuses a size that is not an Int at the schema', async () => {
		const result = await run(
			'{ viewer(id: "u1") { avatar { url(size: 1.5) } } }',
		);
		expect(result.errors).toHaveLength(1);
	});
});
