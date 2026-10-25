import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { createMemoryStores } from '../port/memory';
import { ada, countingReads, single } from './avatar.fixtures';

describe('avatar.set refuses', () => {
	const refused = async (avatar: unknown) => {
		const { counted, reads } = countingReads(createMemoryStores());
		const { auth, received } = single(counted);
		const user = await auth.create(ada);
		const readsBefore = reads.count;
		const events = received.length;

		// @ts-expect-error a JavaScript caller: the argument is not typed here
		const error = await rejection(auth.avatar.set(user, avatar));

		return {
			error,
			readsAfter: reads.count - readsBefore,
			events: received.length - events,
			user,
			auth,
		};
	};

	it.each([
		['an empty id', { id: '' }],
		['an id of 513 characters', { id: 'a'.repeat(513) }],
		['an id that is a number', { id: 42 }],
		['no id', {}],
		['an avatar that is a string', 'img-1'],
		['an avatar that is null', null],
	])('%s, before any read', async (_name, avatar) => {
		const { error, readsAfter, events } = await refused(avatar);

		expect(error).toMatchObject({ code: 'AVATAR_ID_INVALID' });
		expect(readsAfter).toBe(0);
		expect(events).toBe(0);
	});

	it('names the shape in the message, never the value', async () => {
		const { error } = await refused({ id: 'x'.repeat(600) });

		const message = error instanceof Error ? error.message : '';
		expect(message).toBe(
			'avatar.set: the avatar id must be a non-empty string of at most 512 characters',
		);
		expect(message).not.toContain('xxxxx');
	});

	it('leaves the avatar as it was', async () => {
		const { auth } = single();
		const user = await auth.create(ada);
		await auth.avatar.set(user, { id: 'img-1' });

		await rejection(auth.avatar.set(user, { id: '' }));

		expect((await auth.get(user.id)).avatar?.id).toBe('img-1');
	});

	it('is VERSION_CONFLICT for a stale ifVersion, writing nothing', async () => {
		const { auth, received } = single();
		const user = await auth.create(ada);
		const events = received.length;

		const error = await rejection(
			auth.avatar.set(user, { id: 'img-1' }, { ifVersion: user.version + 1 }),
		);

		expect(error).toMatchObject({ code: 'VERSION_CONFLICT' });
		expect((await auth.get(user.id)).avatar).toBeNull();
		expect(received).toHaveLength(events);
	});

	it('writes under a current ifVersion', async () => {
		const { auth } = single();
		const user = await auth.create(ada);

		const written = await auth.avatar.set(
			user,
			{ id: 'img-1' },
			{ ifVersion: user.version },
		);

		expect(written.avatar?.id).toBe('img-1');
	});

	it('is NOT_FOUND for an unknown user, and for a malformed id', async () => {
		const { auth } = single();

		for (const id of ['0199a0db-f800-7000-8000-000000000002', 'not-an-id']) {
			const error = await rejection(auth.avatar.set(id, { id: 'img-1' }));
			expect(error).toMatchObject({ code: 'NOT_FOUND' });
		}
	});
});
