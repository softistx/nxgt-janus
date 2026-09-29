import { describe, expect, it } from 'bun:test';
import { ada, hasher, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { key } from '../../../test/second-factor';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { credentials, firstKeys, setup, signedUp } from './devices.fixtures';

describe('signUp, given a device', () => {
	it('mints its first token, and reports no new device', async () => {
		const { auth, types } = setup();
		const signed = await auth.signUp({ ...ada, password }, { device: null });

		expect(signed.newDevice).toBe(false);
		expect(signed.deviceToken).toStartWith('d1.d1.');
		expect(types()).toEqual(['user.created']);
	});

	it('mints a token of its own over one another user left in the browser', async () => {
		const { auth } = setup();
		const { deviceToken: bobs } = await auth.signUp(
			{ ...ada, email: 'bob@example.test', password },
			{ device: null },
		);
		const signed = await auth.signUp(
			{ ...ada, password },
			{ device: bobs as string },
		);
		expect(signed.deviceToken).not.toBe(bobs);
		expect(signed.newDevice).toBe(false);
	});
});

describe('signIn, given a device', () => {
	it('from the device Ada signed up on: known, the same token, no event', async () => {
		const { auth, newDevices } = setup();
		const { deviceToken } = await signedUp(auth);

		const signed = await auth.signIn(credentials, { device: deviceToken });

		expect(signed).toMatchObject({ newDevice: false, deviceToken });
		expect(newDevices()).toEqual([]);
	});

	it('from a device holding no token: new, a token, and the event naming the session', async () => {
		const { auth, clock, newDevices } = setup();
		const { user } = await signedUp(auth);

		const signed = await auth.signIn(credentials, { device: null });
		if (signed.status !== 'signedIn') throw new Error('expected a session');

		expect(signed.newDevice).toBe(true);
		expect(signed.deviceToken).toStartWith('d1.');
		expect(newDevices()).toEqual([
			{
				id: expect.any(String),
				type: 'user.newDeviceSignedIn',
				occurredAt: clock.now(),
				userId: user.id,
				userType: 'user',
				sessionId: signed.session.id,
			},
		]);
		// Its token is known from then on.
		const again = await auth.signIn(credentials, {
			device: signed.deviceToken,
		});
		expect(again).toMatchObject({ newDevice: false });
		expect(newDevices()).toHaveLength(1);
	});

	it("from a device holding another user's token, or anything else: new, never refused", async () => {
		const { auth, newDevices } = setup();
		const { deviceToken: bobs } = await auth.signUp(
			{ ...ada, email: 'bob@example.test', password },
			{ device: null },
		);
		await signedUp(auth);

		for (const device of [bobs as string, 'garbage', '']) {
			const signed = await auth.signIn(credentials, { device });
			expect(signed).toMatchObject({ newDevice: true });
			expect(signed).not.toMatchObject({ deviceToken: device });
		}
		expect(newDevices()).toHaveLength(3);
	});

	it('with no device: untracked — no token, never new, no event', async () => {
		const { auth, newDevices } = setup();
		await signedUp(auth);

		const signed = await auth.signIn(credentials);

		expect(signed).toMatchObject({ newDevice: false, deviceToken: null });
		expect(newDevices()).toEqual([]);
	});

	it('reports nothing for a password refused', async () => {
		const { auth, newDevices } = setup();
		await signedUp(auth);

		const refused = await rejection(
			auth.signIn({ ...credentials, password: 'wrong' }, { device: null }),
		);

		expect(refused).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		expect(newDevices()).toEqual([]);
	});

	it('reports nothing for a sign-in refused once its session opened: a password written meanwhile', async () => {
		const memory = createMemoryStores();
		let armed = false;
		const store: JanusStores = {
			...memory,
			sessions: {
				...memory.sessions,
				async insertSession(record) {
					await memory.sessions.insertSession(record);
					const user = await memory.users.findUser(record.userId);
					if (armed && user?.password) {
						await memory.users.updateUser(
							user.id,
							{
								password: {
									hash: await hasher.hash('written meanwhile'),
									updatedAt: user.updatedAt,
								},
								updatedAt: user.updatedAt,
							},
							user.version,
						);
					}
				},
			},
		};
		const { auth, newDevices } = setup({ store });
		await signedUp(auth);
		armed = true;

		const refused = await rejection(auth.signIn(credentials, { device: null }));

		expect(refused).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		expect(newDevices()).toEqual([]);
	});
});

describe('the keys, rotated', () => {
	it('a token signed by an older key is known, and answered signed by the first', async () => {
		const store = createMemoryStores();
		const before = setup({ store });
		const { deviceToken } = await signedUp(before.auth);

		const after = setup({
			store,
			keys: [{ id: 'd2', key: key(8) }, ...firstKeys],
		});
		const signed = await after.auth.signIn(credentials, {
			device: deviceToken,
		});

		expect(signed).toMatchObject({ newDevice: false });
		expect(signed).toHaveProperty(
			'deviceToken',
			expect.stringMatching(/^d1\.d2\./),
		);
		expect(after.newDevices()).toEqual([]);
	});

	it('a key removed forgets every device it signed: each is new once', async () => {
		const store = createMemoryStores();
		const before = setup({ store });
		const { deviceToken } = await signedUp(before.auth);

		const after = setup({ store, keys: [{ id: 'd2', key: key(8) }] });
		const signed = await after.auth.signIn(credentials, {
			device: deviceToken,
		});

		expect(signed).toMatchObject({ newDevice: true });
		expect(after.newDevices()).toHaveLength(1);
	});
});
