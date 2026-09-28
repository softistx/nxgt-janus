import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, person } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { challenged, enrolled, key, setup } from '../../../test/second-factor';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';

describe('the keys', () => {
	it('opens a secret sealed with an older key, and seals it again with the first', async () => {
		const store = createMemoryStores();
		const before = setup({ store, keys: [{ id: 'old', key: key(1) }] });
		const { secret, user } = await enrolled(before);

		const after = setup({
			store,
			keys: [
				{ id: 'new', key: key(2) },
				{ id: 'old', key: key(1) },
			],
		});
		after.clock.set(before.clock.now());
		await after.auth.secondFactor.confirm(
			await challenged(after.auth),
			after.codeOf(secret),
		);

		expect(
			(await store.users.findUser(user.id))?.secondFactor?.secret,
		).toStartWith('v1.new.');
	});

	it('refuses to sign in a user with a factor when janus() has no keys', async () => {
		const store = createMemoryStores();
		const context = setup({ store });
		await enrolled(context);
		const bare = janus({
			user: person,
			password: { login: 'email' },
			store,
			hasher,
		});

		expect(
			await rejection(bare.signIn({ email: ada.email, password })),
		).toBeInstanceOf(TypeError);
	});

	it('refuses a configuration that cannot seal', () => {
		const base = {
			user: person,
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher,
		} as const;
		expect(() =>
			janus({
				...base,
				secondFactor: { issuer: ' ', keys: [{ id: 'k', key: key(1) }] },
			}),
		).toThrow('janus: secondFactor.issuer must name your application');
		expect(() =>
			janus({
				...base,
				secondFactor: { issuer: 'Clinic', keys: [{ id: 'k', key: 'short' }] },
			}),
		).toThrow('janus: secondFactor.keys: the key "k" is not 32 bytes');
		expect(() =>
			janus({
				...base,
				secondFactor: {
					issuer: 'Clinic',
					keys: [{ id: 'k', key: key(1) }],
					challenge: 'soon' as '5m',
				},
			}),
		).toThrow('secondFactor.challenge');
	});
});
