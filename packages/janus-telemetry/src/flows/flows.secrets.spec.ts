import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('writes no login, password, token or session id in any signal', async () => {
		const { auth } = setup();
		const secrets: string[] = [email, password];
		const { all } = await collect(async () => {
			const signedUp = await auth.patient.signUp({ email, password });
			const signedIn = await auth.patient.signIn({ email, password });
			secrets.push(signedUp.token, signedIn.token, signedIn.session.id);
			await rejection(auth.patient.signIn({ email, password: 'wrong horse' }));
			await auth.authenticate(
				new Request('https://x.test', {
					headers: { authorization: `Bearer ${signedIn.token}` },
				}),
			);
			await auth.patient.findByLogin(email);
			const verification = await auth.patient.verifyEmail.send(signedIn.user);
			secrets.push(verification.token);
			await auth.patient.verifyEmail.confirm(verification.token);
			const reset = await auth.patient.resetPassword.request(email);
			if (reset === null) throw new Error('the reset was not issued');
			secrets.push(reset.token);
			await auth.patient.resetPassword.confirm(
				reset.token,
				'reset horse battery',
			);
			const again = await auth.patient.signIn({
				email,
				password: 'reset horse battery',
			});
			secrets.push(again.token, again.session.id);
			await auth.signOut(
				new Request('https://x.test', {
					headers: { authorization: `Bearer ${again.token}` },
				}),
			);
			const last = await auth.patient.signIn({
				email,
				password: 'reset horse battery',
			});
			secrets.push(last.token, last.session.id);
			await auth.patient.changePassword(last.user, {
				current: 'reset horse battery',
				next: 'another horse battery',
			});
			await auth.patient.delete(last.user);
		});

		const written = JSON.stringify(all);
		for (const secret of secrets) expect(written).not.toContain(secret);
		for (const name of [
			'janus.email.verified',
			'janus.password.reset',
			'janus.signOut',
			'janus.password.changed',
			'janus.user.deleted',
		]) {
			expect(written).toContain(name);
		}
	});
});
