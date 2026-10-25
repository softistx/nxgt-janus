import { describe, expect, it } from 'bun:test';
import { ada, single } from './avatar.fixtures';

describe('avatar.set', () => {
	it('writes the id and the time, answers the written user, and emits once with no former id', async () => {
		const { auth, clock, received } = single();
		const user = await auth.create(ada);
		clock.advance(1000);

		const written = await auth.avatar.set(user, { id: 'img-1' });

		expect(written.avatar).toEqual({ id: 'img-1', updatedAt: clock.now() });
		expect(written.version).toBe(user.version + 1);
		const avatarEvents = received.filter((e) =>
			e.type.startsWith('user.avatar'),
		);
		expect(avatarEvents).toHaveLength(1);
		expect(avatarEvents[0]).toMatchObject({
			type: 'user.avatarChanged',
			userId: user.id,
			userType: 'user',
			formerAvatarId: null,
			occurredAt: clock.now(),
		});
	});

	it('emits the id it replaced, and moves the time', async () => {
		const { auth, clock, received } = single();
		const user = await auth.create(ada);
		await auth.avatar.set(user, { id: 'img-1' });
		clock.advance(1000);

		const written = await auth.avatar.set(user.id, { id: 'img-2' });

		expect(written.avatar).toEqual({ id: 'img-2', updatedAt: clock.now() });
		const last = received.at(-1);
		expect(last?.type).toBe('user.avatarChanged');
		expect(last?.formerAvatarId).toBe('img-1');
	});

	it('accepts an id of 512 characters', async () => {
		const { auth } = single();
		const user = await auth.create(ada);
		const id = 'a'.repeat(512);

		expect((await auth.avatar.set(user, { id })).avatar?.id).toBe(id);
	});

	it('writes nothing and emits nothing for the id the user already has', async () => {
		const { auth, clock, received } = single();
		const user = await auth.create(ada);
		const first = await auth.avatar.set(user, { id: 'img-1' });
		clock.advance(1000);
		const before = received.length;

		const again = await auth.avatar.set(user, { id: 'img-1' });

		expect(again).toEqual(first);
		expect(received).toHaveLength(before);
		expect((await auth.get(user.id)).version).toBe(first.version);
	});

	it('is read back by get and find, and leaves the other fields alone', async () => {
		const { auth } = single();
		const user = await auth.create(ada);
		await auth.avatar.set(user, { id: 'img-1' });

		const got = await auth.get(user.id);
		const found = await auth.find(user.id);

		expect(got.avatar?.id).toBe('img-1');
		expect(found?.avatar?.id).toBe('img-1');
		expect(got.email).toBe(ada.email);
		expect(got.name).toBe(ada.name);
	});

	it('is read back through getUser and findUser at the root', async () => {
		const { auth } = single();
		const user = await auth.create(ada);
		await auth.avatar.set(user, { id: 'img-1' });

		expect((await auth.getUser(user.id)).avatar?.id).toBe('img-1');
		expect((await auth.findUser(user.id))?.avatar?.id).toBe('img-1');
	});
});
