import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { enrolled, setup } from './flows.fixtures';

describe('secondFactor.enroll and activate', () => {
	it('answers the secret and its URI, and stores the secret sealed', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const { secret, uri } = await auth.secondFactor.enroll(user);

		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(uri).toStartWith('otpauth://totp/Clinic:ada%40example.test?');
		expect(new URL(uri).searchParams.get('secret')).toBe(secret);
		const record = await store.users.findUser(user.id);
		expect(record?.secondFactor).toMatchObject({
			method: 'totp',
			confirmedAt: null,
			lastStep: null,
		});
		expect(record?.secondFactor?.secret).toStartWith('v1.k1.');
		expect(record?.secondFactor?.secret).not.toContain(secret);
	});

	it('asks for nothing until a first code activated the factor', async () => {
		const { auth, codeOf } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const { secret } = await auth.secondFactor.enroll(user);

		const before = await auth.signIn({ email: ada.email, password });
		expect(before.status).toBe('signedIn');
		expect((await auth.get(user.id)).hasSecondFactor).toBe(false);

		const active = await auth.secondFactor.activate(user, codeOf(secret));
		expect(active.hasSecondFactor).toBe(true);
		expect((await auth.signIn({ email: ada.email, password })).status).toBe(
			'secondFactor',
		);
	});

	it('refuses a wrong first code, and keeps the factor waiting', async () => {
		const { auth, codeOf } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const { secret } = await auth.secondFactor.enroll(user);
		const wrong = codeOf(secret) === '000000' ? '111111' : '000000';

		const refused = await rejection(auth.secondFactor.activate(user, wrong));

		expect(refused).toMatchObject({
			code: 'CODE_INVALID',
			attemptsLeft: undefined,
		});
		expect((await auth.get(user.id)).hasSecondFactor).toBe(false);
	});

	it('says which state a factor is in when it cannot change', async () => {
		const context = setup();
		const { auth } = context;
		const { user } = await auth.signUp({ ...ada, password });

		expect(
			await rejection(auth.secondFactor.activate(user, '123456')),
		).toMatchObject({
			code: 'SECOND_FACTOR_NOT_ENROLLED',
		});

		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(user, context.codeOf(secret));
		expect(await rejection(auth.secondFactor.enroll(user))).toMatchObject({
			code: 'SECOND_FACTOR_ACTIVE',
		});
		expect(
			await rejection(
				auth.secondFactor.activate(user, context.codeOf(secret, 1)),
			),
		).toMatchObject({ code: 'SECOND_FACTOR_ACTIVE' });
	});

	it('replaces a factor still waiting: the last QR code shown is the one that works', async () => {
		const { auth, codeOf } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const first = await auth.secondFactor.enroll(user);
		const second = await auth.secondFactor.enroll(user);

		expect(second.secret).not.toBe(first.secret);
		expect(
			await rejection(auth.secondFactor.activate(user, codeOf(first.secret))),
		).toMatchObject({ code: 'CODE_INVALID' });
		await auth.secondFactor.activate(user, codeOf(second.secret));
	});
});

describe('secondFactor.disable', () => {
	it('removes the factor: signIn answers a session again', async () => {
		const context = setup();
		const { auth, store } = context;
		const { user } = await enrolled(context);

		const disabled = await auth.secondFactor.disable(user);

		expect(disabled.hasSecondFactor).toBe(false);
		expect((await store.users.findUser(user.id))?.secondFactor).toBeNull();
		expect((await auth.signIn({ email: ada.email, password })).status).toBe(
			'signedIn',
		);
	});
});
