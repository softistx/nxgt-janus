import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { hasher, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import type { JanusError } from '../../errors/janus-error';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import { changing, NEW_EMAIL, verifiedAda } from './change-email.fixtures';
import { formerHash } from './change-email-token';

describe('changeEmail.confirm, and what runs beside it', () => {
	it('lets exactly one of twenty concurrent confirmations through', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		const sent = await context.auth.changeEmail.send(user, NEW_EMAIL);

		const outcomes = await Promise.all(
			Array.from({ length: 20 }, () =>
				context.auth.changeEmail.confirm(sent.token).then(
					() => 'changed',
					(error: JanusError) => error.code,
				),
			),
		);

		expect(outcomes.filter((outcome) => outcome === 'changed')).toHaveLength(1);
		expect(
			outcomes.filter((outcome) => outcome === 'TOKEN_SPENT'),
		).toHaveLength(19);
		expect((await context.auth.get(user.id)).email).toBe(NEW_EMAIL);
	});

	it('is TOKEN_UNKNOWN for the token of another user type', async () => {
		const Member = z.strictObject({ email: z.email(), name: z.string() });
		const auth = janus({
			users: {
				patient: { schema: Member, password: { login: 'email' } },
				member: { schema: Member, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
		});
		const { user } = await auth.patient.signUp({
			email: 'p@example.test',
			name: 'P',
			password,
		});
		const sent = await auth.patient.changeEmail.send(user, NEW_EMAIL);

		expect(
			await rejection(auth.member.changeEmail.confirm(sent.token)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect((await auth.patient.get(user.id)).email).toBe('p@example.test');
	});

	it('is spent by an update that moves the e-mail: A to C to A revives nothing', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.update(user, { email: 'other@example.test' });
		await auth.update(user, { email: 'ada@example.test' });

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_SPENT' },
		);
		expect((await auth.get(user.id)).email).toBe('ada@example.test');
	});

	it('is not spent by an update that leaves the e-mail alone', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.update(user, { name: 'Ada King' });

		expect((await auth.changeEmail.confirm(sent.token)).email).toBe(NEW_EMAIL);
	});
});

describe('changeEmail.send, once throttled', () => {
	it('leaves the last link sent working after a MAIL_THROTTLED refusal', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		let last = await context.auth.changeEmail.send(user, 'n0@example.test');
		for (let i = 1; i < 5; i++) {
			last = await context.auth.changeEmail.send(user, `n${i}@example.test`);
		}
		expect(
			await rejection(context.auth.changeEmail.send(user, NEW_EMAIL)),
		).toMatchObject({ code: 'MAIL_THROTTLED' });

		const changed = await context.auth.changeEmail.confirm(last.token);

		expect(changed.email).toBe('n4@example.test');
	});
});

describe('formerHash', () => {
	it('differs from the plain hash of the secret, even for no former address', async () => {
		const { hashSecret } = await import('../secrets');

		expect(formerHash('secret', null)).not.toBe(hashSecret('secret'));
		expect(formerHash('secret', 'A@b.test')).toBe(
			formerHash('secret', 'a@b.test'),
		);
		expect(formerHash('secret', 'a@b.test')).not.toBe(
			formerHash('secret', null),
		);
	});
});
