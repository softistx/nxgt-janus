import { describe, expect, it } from 'bun:test';
import { ada } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { byAddress, mailing, signedUp, times } from '../mail-requests.fixtures';

const nobody = 'nobody@example.test';

describe('verifyEmail.prepare, then send', () => {
	it('issues for an unverified user, once', async () => {
		const context = mailing();
		const { auth, issued } = context;
		await signedUp(context);
		const pending = await auth.verifyEmail.prepare(ada.email.toUpperCase());

		expect(issued).toEqual([]);
		const sent = await pending.send();

		expect(sent).toMatchObject({
			email: ada.email,
			user: { email: ada.email, emailVerified: false },
		});
		expect(issued).toEqual(['verifyEmail']);
		await auth.verifyEmail.confirm(sent?.token ?? '');
		expect(await rejection(pending.send())).toBeInstanceOf(TypeError);
	});

	it('does nothing for nobody, for a verified address and for an inactive user', async () => {
		const context = mailing();
		const { auth, issued } = context;
		const user = await signedUp(context);

		expect(await (await auth.verifyEmail.prepare(nobody)).send()).toBeNull();

		await auth.setActive(user, false);
		expect(await (await auth.verifyEmail.prepare(ada.email)).send()).toBeNull();
		await auth.setActive(user, true);

		const token = (await auth.verifyEmail.send(user)).token;
		issued.length = 0;
		await auth.verifyEmail.confirm(token);
		expect(await (await auth.verifyEmail.prepare(ada.email)).send()).toBeNull();
		expect(issued).toEqual([]);
	});

	it('counts per address in prepare, known or not, and send counts nothing', async () => {
		const context = mailing({ mail: { throttle: { attempts: 1 } } });
		const { auth } = context;
		await signedUp(context);

		await (await auth.verifyEmail.prepare(ada.email)).send();
		await auth.verifyEmail.prepare(nobody);
		const known = await rejection(auth.verifyEmail.prepare(ada.email));
		const unknown = await rejection(auth.verifyEmail.prepare(nobody));

		expect(known).toMatchObject({
			code: 'MAIL_THROTTLED',
			message: byAddress('verifyEmail.prepare'),
		});
		expect(unknown).toMatchObject({
			code: 'MAIL_THROTTLED',
			message: byAddress('verifyEmail.prepare'),
		});
	});

	it('leaves the per-user count of verifyEmail.send alone', async () => {
		const context = mailing();
		const { auth } = context;
		const user = await signedUp(context);

		await times(5, () => auth.verifyEmail.prepare(ada.email));

		expect(await auth.verifyEmail.send(user)).toMatchObject({
			email: ada.email,
		});
	});
});
