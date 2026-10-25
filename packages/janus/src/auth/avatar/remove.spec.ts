import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { ada, single } from './avatar.fixtures';

describe('avatar.remove', () => {
	it('clears the avatar, answers the written user, and emits the id it had', async () => {
		const { auth, clock, received } = single();
		const user = await auth.create(ada);
		const set = await auth.avatar.set(user, { id: 'img-1' });
		clock.advance(1000);

		const written = await auth.avatar.remove(user);

		expect(written.avatar).toBeNull();
		expect(written.version).toBe(set.version + 1);
		expect((await auth.get(user.id)).avatar).toBeNull();
		const last = received.at(-1);
		expect(last).toMatchObject({
			type: 'user.avatarRemoved',
			userId: user.id,
			formerAvatarId: 'img-1',
			occurredAt: clock.now(),
		});
	});

	it('writes nothing and emits nothing for a user with no avatar', async () => {
		const { auth, received } = single();
		const user = await auth.create(ada);
		const events = received.length;

		const answered = await auth.avatar.remove(user.id);

		expect(answered).toEqual(user);
		expect(received).toHaveLength(events);
	});

	it('is a no-op the second time', async () => {
		const { auth, received } = single();
		const user = await auth.create(ada);
		await auth.avatar.set(user, { id: 'img-1' });
		const first = await auth.avatar.remove(user);
		const events = received.length;

		expect(await auth.avatar.remove(user)).toEqual(first);
		expect(received).toHaveLength(events);
	});

	it('is VERSION_CONFLICT for a stale ifVersion, keeping the avatar', async () => {
		const { auth } = single();
		const user = await auth.create(ada);
		const set = await auth.avatar.set(user, { id: 'img-1' });

		const error = await rejection(
			auth.avatar.remove(user, { ifVersion: set.version + 1 }),
		);

		expect(error).toMatchObject({ code: 'VERSION_CONFLICT' });
		expect((await auth.get(user.id)).avatar?.id).toBe('img-1');
	});

	it('is NOT_FOUND for an unknown user', async () => {
		const { auth } = single();

		const error = await rejection(
			auth.avatar.remove('0199a0db-f800-7000-8000-000000000002'),
		);

		expect(error).toMatchObject({ code: 'NOT_FOUND' });
	});
});
