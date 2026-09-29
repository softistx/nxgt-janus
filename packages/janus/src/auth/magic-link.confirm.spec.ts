import { describe, expect, it } from 'bun:test';
import { ada, bearer, hasher, password, person, setup } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { fixedClock } from '../time/clock';
import { setup as listening, types } from './events.fixtures';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import { codeAt, fromBase32, stepAt } from './totp';

describe('magicLink.confirm', () => {
	it('signs in, verifies the e-mail, and spends the token', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const issued = await auth.magicLink.request(ada.email);
		if (issued === null) throw new Error('expected a link');

		const signedIn = await auth.magicLink.confirm(issued.token);

		expect(signedIn.status).toBe('signedIn');
		expect(signedIn.user.emailVerified).toBe(true);
		expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
			signedIn.user.id,
		);
		expect(await rejection(auth.magicLink.confirm(issued.token))).toMatchObject(
			{ code: 'TOKEN_SPENT' },
		);
	});

	it('signs in a user who has no password', async () => {
		const { auth } = setup();
		await auth.create(ada);
		const issued = await auth.magicLink.request(ada.email);

		const signedIn = await auth.magicLink.confirm(issued?.token ?? '');

		expect(signedIn.user.hasPassword).toBe(false);
	});

	it('opens one session for a link confirmed twice at once', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const issued = await auth.magicLink.request(ada.email);
		const token = issued?.token ?? '';

		const outcomes = await Promise.allSettled(
			Array.from({ length: 10 }, () => auth.magicLink.confirm(token)),
		);

		expect(
			outcomes.filter((outcome) => outcome.status === 'fulfilled'),
		).toHaveLength(1);
		expect(
			outcomes
				.filter((outcome) => outcome.status === 'rejected')
				.map((outcome) => (outcome.reason as { code: string }).code),
		).toEqual(Array(9).fill('TOKEN_SPENT'));
	});

	it('reports the e-mail it proved once, and writes nothing for one already verified', async () => {
		const { auth, received } = listening();
		await auth.signUp({ ...ada, password });
		const first = await auth.magicLink.request(ada.email);
		const verified = await auth.magicLink.confirm(first?.token ?? '');
		const again = await auth.magicLink.request(ada.email);

		const signedIn = await auth.magicLink.confirm(again?.token ?? '');

		expect(signedIn.user.version).toBe(verified.user.version);
		expect(types(received)).toEqual([
			'user.created',
			'user.emailVerified',
			'user.passwordChanged',
		]);
	});

	it('survives a password write: the password proves nothing a link does', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const issued = await auth.magicLink.request(ada.email);

		await auth.changePassword(user, { current: password, next: 'a new one!' });

		expect((await auth.magicLink.confirm(issued?.token ?? '')).status).toBe(
			'signedIn',
		);
	});

	it('still asks for an active second factor, on an e-mail already verified', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 28));
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher,
			clock,
			secondFactor: {
				issuer: 'Clinic',
				keys: [{ id: 'k1', key: Buffer.alloc(32, 1).toString('base64') }],
			},
		});
		const { user } = await auth.signUp({ ...ada, password });
		// A first proof would remove the factor: prove the e-mail before.
		await auth.verifyEmail.confirm((await auth.verifyEmail.send(user)).token);
		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(
			user,
			codeAt(fromBase32(secret), stepAt(clock.now())),
		);
		const issued = await auth.magicLink.request(ada.email);

		const result = await auth.magicLink.confirm(issued?.token ?? '');

		expect(result.status).toBe('secondFactor');
		if (result.status !== 'secondFactor') throw new Error('expected a factor');
		clock.advance(30_000);
		const code = codeAt(fromBase32(secret), stepAt(clock.now()));
		expect(
			(await auth.secondFactor.confirm(result.challenge, code)).user.id,
		).toBe(user.id);
	});
});
