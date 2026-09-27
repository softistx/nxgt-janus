import { describe, expect, it } from 'bun:test';
import {
	ada,
	hasher,
	password,
	person,
	rejection,
	setup,
} from '../../test/auth';
import { fixedClock } from '../time/clock';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import { other } from './sign-in-code.fixtures';
import { codeAt, fromBase32, stepAt } from './totp';

describe('signInCode.confirm', () => {
	it('refuses the code of another challenge: the hash is keyed by its own', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const first = await auth.signInCode.request(ada.email);
		const second = await auth.signInCode.request(ada.email);
		if (first === null || second === null) throw new Error('expected codes');

		const outcome =
			first.code === second.code
				? 'same code, nothing to cross'
				: await rejection(
						auth.signInCode.confirm(second.challenge, first.code),
					);
		expect(
			outcome === 'same code, nothing to cross' ||
				(outcome as { code: string }).code === 'CODE_INVALID',
		).toBe(true);
	});

	it('refuses an unknown, a lapsed or a stale challenge, and an inactive user', async () => {
		const { auth, clock } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		expect(
			await rejection(auth.signInCode.confirm('nope', '123456')),
		).toMatchObject({
			code: 'TOKEN_UNKNOWN',
		});

		const lapsed = await auth.signInCode.request(ada.email);
		clock.advance(10 * 60_000);
		expect(
			await rejection(
				auth.signInCode.confirm(lapsed?.challenge ?? '', lapsed?.code ?? ''),
			),
		).toMatchObject({ code: 'TOKEN_EXPIRED' });

		const stale = await auth.signInCode.request(ada.email);
		await auth.update(user, { email: 'lovelace@example.test' });
		expect(
			await rejection(
				auth.signInCode.confirm(stale?.challenge ?? '', stale?.code ?? ''),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });

		const inactive = await auth.signInCode.request('lovelace@example.test');
		await auth.setActive(user, false);
		expect(
			await rejection(
				auth.signInCode.confirm(
					inactive?.challenge ?? '',
					inactive?.code ?? '',
				),
			),
		).toMatchObject({ code: 'USER_INACTIVE' });
	});

	it("answers another type's challenge as unknown", async () => {
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				member: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
		});
		await auth.patient.signUp({ ...ada, password });
		const issued = await auth.patient.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		// Right or wrong, another type's API compares nothing, names nobody,
		// and leaves the challenge unspent — each call still costs an attempt.
		for (const code of [other(issued.code), issued.code]) {
			const refused = await rejection(
				auth.member.signInCode.confirm(issued.challenge, code),
			);
			expect(refused).toMatchObject({
				code: 'TOKEN_UNKNOWN',
				userId: undefined,
			});
		}
		expect(
			(await auth.patient.signInCode.confirm(issued.challenge, issued.code))
				.status,
		).toBe('signedIn');
	});

	it("spends the challenge once another type's API took its last attempt", async () => {
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				member: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
		});
		await auth.patient.signUp({ ...ada, password });
		const issued = await auth.patient.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(
				await rejection(
					auth.member.signInCode.confirm(issued.challenge, issued.code),
				),
			).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		}
		expect(
			await rejection(
				auth.patient.signInCode.confirm(issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('still asks for an active second factor', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 26));
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
		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(
			user,
			codeAt(fromBase32(secret), stepAt(clock.now())),
		);
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		const result = await auth.signInCode.confirm(issued.challenge, issued.code);

		expect(result.status).toBe('secondFactor');
		// The code proved the e-mail, whatever the second factor answers.
		expect((await auth.get(user.id)).emailVerified).toBe(true);
	});
});
