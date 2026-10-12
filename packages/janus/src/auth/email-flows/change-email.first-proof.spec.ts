import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { changing, NEW_EMAIL, verifiedAda } from './change-email.fixtures';

describe('after changeEmail.confirm', () => {
	it('a magic link to the new address is not a first proof: password kept', async () => {
		const context = changing();
		const user = await verifiedAda(context);
		const sent = await context.auth.changeEmail.send(user, NEW_EMAIL);
		await context.auth.changeEmail.confirm(sent.token);

		const link = await context.auth.magicLink.request(NEW_EMAIL);
		await context.auth.magicLink.confirm(link?.token ?? '');

		const after = await context.auth.get(user.id);
		expect(after.hasPassword).toBe(true);
		expect(
			(await context.auth.signIn({ email: NEW_EMAIL, password })).user.id,
		).toBe(user.id);
	});

	it('links asked for the former address are TOKEN_STALE', async () => {
		const context = changing();
		const { auth } = context;
		const user = await verifiedAda(context);
		const reset = await auth.resetPassword.request(ada.email);
		const verify = await auth.verifyEmail.send(user);
		const sent = await auth.changeEmail.send(user, NEW_EMAIL);
		await auth.changeEmail.confirm(sent.token);

		expect(
			await rejection(auth.resetPassword.confirm(reset?.token ?? '', password)),
		).toMatchObject({ code: 'TOKEN_STALE' });
		expect(
			await rejection(auth.verifyEmail.confirm(verify.token)),
		).toMatchObject({ code: 'TOKEN_STALE' });
	});
});
