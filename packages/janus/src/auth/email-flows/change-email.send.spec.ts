import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import {
	changing,
	HOUR,
	NEW_EMAIL,
	verifiedAda,
} from './change-email.fixtures';

describe('changeEmail.send', () => {
	it('issues a token for the new address, and changes nothing yet', async () => {
		const context = changing();
		const user = await verifiedAda(context);

		const sent = await context.auth.changeEmail.send(user, NEW_EMAIL);

		expect(sent.email).toBe(NEW_EMAIL);
		expect(sent.expiresAt.getTime() - context.clock.now().getTime()).toBe(HOUR);
		const same = await context.auth.get(user.id);
		expect(same.email).toBe(ada.email);
		expect(same.emailVerified).toBe(true);
		// The store holds hashes: neither the token nor the former address.
		const stored = JSON.stringify(await context.store.users.findUser(user.id));
		expect(stored).not.toContain(sent.token);
	});

	it('refuses a malformed address as USER_INVALID, issuing nothing', async () => {
		const context = changing();
		const user = await verifiedAda(context);

		expect(
			await rejection(context.auth.changeEmail.send(user, 'not an e-mail')),
		).toMatchObject({ code: 'USER_INVALID' });
	});

	it('refuses the current address, as typed or in another case, spending nothing', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		for (let i = 0; i < 3; i++) {
			expect(
				await rejection(context.auth.changeEmail.send(user, ada.email)),
			).toMatchObject({ code: 'USER_INVALID' });
			expect(
				await rejection(
					context.auth.changeEmail.send(user, ada.email.toUpperCase()),
				),
			).toMatchObject({ code: 'USER_INVALID' });
		}

		// Six refusals counted nothing: five links can still be asked for.
		for (let i = 0; i < 5; i++) {
			await context.auth.changeEmail.send(user, `n${i}@example.test`);
		}
		expect(
			await rejection(context.auth.changeEmail.send(user, NEW_EMAIL)),
		).toMatchObject({ code: 'MAIL_THROTTLED' });
	});

	it('counts nothing for a malformed address: five of them, then a valid one', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		for (let i = 0; i < 5; i++) {
			expect(
				await rejection(context.auth.changeEmail.send(user, `bad ${i}`)),
			).toMatchObject({ code: 'USER_INVALID' });
		}

		const sent = await context.auth.changeEmail.send(user, NEW_EMAIL);

		expect(sent.email).toBe(NEW_EMAIL);
		expect((await context.auth.changeEmail.confirm(sent.token)).email).toBe(
			NEW_EMAIL,
		);
	});

	it('does not check whether the address is taken', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		await context.auth.create({ email: NEW_EMAIL, name: 'Countess' });

		const sent = await context.auth.changeEmail.send(user, NEW_EMAIL);

		expect(sent.email).toBe(NEW_EMAIL);
	});

	it('is NOT_FOUND for nobody and USER_INACTIVE for an inactive user', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		await context.auth.setActive(user, false);

		expect(
			await rejection(context.auth.changeEmail.send(user, NEW_EMAIL)),
		).toMatchObject({ code: 'USER_INACTIVE' });
		expect(
			await rejection(
				context.auth.changeEmail.send(
					'0199c5a0-0000-7000-8000-000000000000',
					NEW_EMAIL,
				),
			),
		).toMatchObject({ code: 'NOT_FOUND' });
	});

	it('spends the earlier links: only the last one sent works', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		const first = await context.auth.changeEmail.send(user, NEW_EMAIL);
		const second = await context.auth.changeEmail.send(user, 'x@example.test');

		expect(
			await rejection(context.auth.changeEmail.confirm(first.token)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
		expect((await context.auth.changeEmail.confirm(second.token)).email).toBe(
			'x@example.test',
		);
	});
});

describe('changeEmail.send, throttled', () => {
	it('counts the user and the new address, each before anything is issued', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		for (let i = 0; i < 5; i++) {
			await context.auth.changeEmail.send(user, `n${i}@example.test`);
		}

		expect(
			await rejection(context.auth.changeEmail.send(user, NEW_EMAIL)),
		).toMatchObject({ code: 'MAIL_THROTTLED', userId: user.id });
	});

	it('refuses past five for one address, whoever asks', async () => {
		const context = changing();
		const others = [];
		for (let i = 0; i < 6; i++) {
			const { user } = await context.auth.signUp({
				email: `u${i}@example.test`,
				name: 'U',
				password,
			});
			others.push(user);
		}
		for (const other of others.slice(0, 5)) {
			await context.auth.changeEmail.send(other, NEW_EMAIL);
		}

		expect(
			await rejection(
				context.auth.changeEmail.send(others[5] ?? '', NEW_EMAIL),
			),
		).toMatchObject({ code: 'MAIL_THROTTLED' });
	});

	it('carries the asking user in the refusal of an address another user exhausted', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		for (let i = 0; i < 5; i++) {
			const { user: other } = await context.auth.signUp({
				email: `u${i}@example.test`,
				name: 'U',
				password,
			});
			await context.auth.changeEmail.send(other, NEW_EMAIL);
		}

		const refused = await rejection(
			context.auth.changeEmail.send(user, NEW_EMAIL),
		);

		expect(refused).toMatchObject({ code: 'MAIL_THROTTLED', userId: user.id });
		// The user is counted first: the refusal cost one of their own five.
		for (let i = 0; i < 4; i++) {
			await context.auth.changeEmail.send(user, `n${i}@example.test`);
		}
		expect(
			await rejection(context.auth.changeEmail.send(user, 'n4@example.test')),
		).toMatchObject({ code: 'MAIL_THROTTLED', userId: user.id });
	});

	it('lets an account past its own count exhaust no address', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		for (let i = 0; i < 5; i++) {
			await context.auth.changeEmail.send(user, `own${i}@example.test`);
		}
		for (let target = 0; target < 3; target++) {
			for (let i = 0; i < 5; i++) {
				await rejection(
					context.auth.changeEmail.send(user, `victim${target}@example.test`),
				);
			}
		}
		const { user: other } = await context.auth.signUp({
			email: 'other@example.test',
			name: 'O',
			password,
		});

		for (let target = 0; target < 3; target++) {
			await context.auth.changeEmail.send(other, `victim${target}@example.test`);
		}
	});
});
