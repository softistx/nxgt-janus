import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import {
	changing,
	HOUR,
	NEW_EMAIL,
	verifiedAda,
} from './change-email.fixtures';

describe('changeEmail.confirm', () => {
	it('moves the user to the new address, verified, keeping password and sessions', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const signedIn = await auth.signIn({ email: ada.email, password });
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);

		const changed = await auth.changeEmail.confirm(sent.token);

		expect(changed.email).toBe(NEW_EMAIL);
		expect(changed.emailVerified).toBe(true);
		expect(changed.hasPassword).toBe(true);
		expect((await auth.signIn({ email: NEW_EMAIL, password })).user.id).toBe(
			user.id,
		);
		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		expect(signedIn.user.id).toBe(user.id);
		expect((await auth.findByEmail(NEW_EMAIL))?.id).toBe(user.id);
	});

	it('verifies an address the user had not verified', async () => {
		const context = changing();
		const { auth } = context;
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);

		const changed = await auth.changeEmail.confirm(sent.token);

		expect(changed.emailVerified).toBe(true);
		expect(context.types()).toEqual([
			'user.created',
			'user.emailChanged',
			'user.emailVerified',
		]);
	});

	it('is single use, lapses, and names no secret in any refusal', async () => {
		const context = changing();
		const { auth, clock } = context;
		const user = await verifiedAda(context);
		const used = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.changeEmail.confirm(used.token);
		const lapsing = await auth.changeEmail.send(user, ada.email);
		clock.advance(HOUR);

		const refusals = [
			await rejection(auth.changeEmail.confirm(used.token)),
			await rejection(auth.changeEmail.confirm(lapsing.token)),
			await rejection(auth.changeEmail.confirm('forged')),
		] as { code: string; message: string }[];

		expect(refusals.map((error) => error.code)).toEqual([
			'TOKEN_SPENT',
			'TOKEN_EXPIRED',
			'TOKEN_UNKNOWN',
		]);
		for (const { message } of refusals) {
			expect(message).not.toContain(used.token);
			expect(message).not.toContain(lapsing.token);
		}
	});

	it('is not redeemable as a verification, nor a verification as a change', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const change = await auth.changeEmail.send(user, NEW_EMAIL);
		const verify = await auth.verifyEmail.send(user);

		expect(
			await rejection(auth.verifyEmail.confirm(change.token)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			await rejection(auth.changeEmail.confirm(verify.token)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});

	it('is TOKEN_STALE once the e-mail moved since the link was asked', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.update(user, { email: 'other@example.test' });

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_STALE' },
		);
		expect((await auth.get(user.id)).email).toBe('other@example.test');
	});

	it('leaves a case-only difference of the former address alone', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.update(user, { email: 'ADA@example.test' });

		expect((await auth.changeEmail.confirm(sent.token)).email).toBe(NEW_EMAIL);
	});

	it('refuses an address taken since with LOGIN_TAKEN: token spent, nothing written', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.create({ email: NEW_EMAIL, name: 'Countess' });

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'LOGIN_TAKEN' },
		);
		expect((await auth.get(user.id)).email).toBe(ada.email);
		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_SPENT' },
		);
	});

	it('is USER_INACTIVE for an inactive user, and TOKEN_UNKNOWN for a deleted one', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.setActive(user, false);
		const gone = await auth.signUp({
			email: 'gone@example.test',
			name: 'Gone',
			password,
		});
		const goneSent = await auth.changeEmail.send(gone.user, 'g@example.test');
		await auth.delete(gone.user);

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'USER_INACTIVE' },
		);
		expect(
			await rejection(auth.changeEmail.confirm(goneSent.token)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});
});
