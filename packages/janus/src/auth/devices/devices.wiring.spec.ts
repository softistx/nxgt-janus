import { describe, expect, it } from 'bun:test';
import {
	ada,
	hasher,
	password,
	person,
	setup as plain,
} from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import { credentials, setup } from './devices.fixtures';

describe('a device given to a janus() wired without devices', () => {
	it('is a wiring mistake: a TypeError naming the call, before anything is written', async () => {
		const { auth, store } = plain();

		const refused = await rejection(
			auth.signUp({ ...ada, password }, { device: null }),
		);

		expect(refused).toBeInstanceOf(TypeError);
		expect((refused as Error).message).toBe(
			'signUp: a device was given, but janus() has no devices — pass devices: { keys }',
		);
		expect(await store.users.findUserByLogin('user', ada.email)).toBeNull();
	});

	it('leaves a sign-in given no device as it was', async () => {
		const { auth } = plain();
		await auth.signUp({ ...ada, password });
		expect(await auth.signIn(credentials)).toMatchObject({
			newDevice: false,
			deviceToken: null,
		});
	});
});

describe('a device that is not a token, from JavaScript', () => {
	it('is a TypeError naming the option', async () => {
		const { auth } = setup();
		const refused = await rejection(
			auth.signIn(credentials, { device: 42 as unknown as string }),
		);
		expect(refused).toBeInstanceOf(TypeError);
		expect((refused as Error).message).toBe(
			'signIn: options.device must be the device token the client holds, or null when it holds none',
		);
	});
});

describe('janus({ devices })', () => {
	it('refuses no key, naming the option', () => {
		expect(() =>
			janus({
				user: person,
				password: { login: 'email' },
				store: createMemoryStores(),
				hasher,
				devices: { keys: [] as never },
			}),
		).toThrow('janus: devices.keys: expected at least one key');
	});
});
