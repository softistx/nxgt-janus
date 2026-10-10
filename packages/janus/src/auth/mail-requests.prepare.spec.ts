import { describe, expect, it } from 'bun:test';
import { ada, hasher, person } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { janus } from './janus';
import {
	byAddress,
	mailing,
	preparedFlows,
	recording,
	signedUp,
	times,
} from './mail-requests.fixtures';

const nobody = 'nobody@example.test';

describe.each([...preparedFlows])(
	'$flow.prepare, then send',
	({ flow, kind, prepare, request }) => {
		it('counts once in prepare, and send counts nothing', async () => {
			const context = mailing({ mail: { throttle: { attempts: 1 } } });
			const { auth, issued } = context;
			await signedUp(context);

			const pending = await prepare(auth, ada.email);
			// The one request the window allows is prepare's: send would be refused if it counted.
			expect(await pending.send()).toMatchObject({ email: ada.email });
			expect(issued).toEqual([kind]);

			const refused = await rejection(prepare(auth, ada.email));
			expect(refused).toMatchObject({
				code: 'MAIL_THROTTLED',
				message: byAddress(`${flow}.prepare`),
			});
		});

		it('refuses past the limit with MAIL_THROTTLED and retryAfter, issuing nothing', async () => {
			const context = mailing();
			const { auth, issued } = context;
			await signedUp(context);

			// Prepared and never sent: counted, and nothing issued.
			await times(5, () => prepare(auth, ada.email));
			expect(issued).toEqual([]);

			const refused = await rejection(prepare(auth, ada.email));
			expect(refused).toMatchObject({
				name: 'MailThrottledError',
				code: 'MAIL_THROTTLED',
				retryAfter: 600,
				userType: 'user',
			});
			expect((refused as { userId?: unknown }).userId).toBeUndefined();
			expect(issued).toEqual([]);
		});

		it('shares its count with request: one window per flow and address', async () => {
			const context = mailing();
			const { auth } = context;
			await signedUp(context);
			await times(3, () => prepare(auth, ada.email));
			await times(2, () => request(auth, ada.email));

			expect(await rejection(request(auth, ada.email))).toMatchObject({
				code: 'MAIL_THROTTLED',
				message: byAddress(`${flow}.request`),
			});
			expect(await rejection(prepare(auth, ada.email))).toMatchObject({
				code: 'MAIL_THROTTLED',
			});
		});

		it('sends once: a second send is a TypeError, and issues nothing', async () => {
			const context = mailing();
			const { auth, issued } = context;
			await signedUp(context);
			const pending = await prepare(auth, ada.email);
			await pending.send();

			const again = await rejection(pending.send());

			expect(again).toBeInstanceOf(TypeError);
			expect((again as Error).message).toBe(
				`${flow}.prepare(…).send: already called — a prepared request sends once; call ${flow}.prepare again for another`,
			);
			expect(issued).toEqual([kind]);
		});

		it('sends once when two sends race: exactly one issues', async () => {
			const context = mailing();
			const { auth, issued } = context;
			await signedUp(context);
			const pending = await prepare(auth, ada.email);

			const settled = await Promise.allSettled([
				pending.send(),
				pending.send(),
			]);

			expect(settled.map((one) => one.status).sort()).toEqual([
				'fulfilled',
				'rejected',
			]);
			expect(issued).toEqual([kind]);
		});

		it('answers null for an address nobody holds, and is single-use there too', async () => {
			const { auth, issued } = mailing();
			const pending = await prepare(auth, nobody);

			expect(await pending.send()).toBeNull();
			expect(await rejection(pending.send())).toBeInstanceOf(TypeError);
			expect(issued).toEqual([]);
		});

		it('answers a frozen object: send cannot be swapped', async () => {
			const { auth } = mailing();
			expect(Object.isFrozen(await prepare(auth, nobody))).toBe(true);
		});

		it('with the throttle off, prepares and sends without counting', async () => {
			const context = mailing({ mail: { throttle: false } });
			const { auth, issued } = context;
			await signedUp(context);

			const answers = await times(7, async () =>
				(await prepare(auth, ada.email)).send(),
			);

			expect(answers).toHaveLength(7);
			for (const answer of answers) {
				expect(answer).toMatchObject({ email: ada.email });
			}
			expect(issued).toEqual(Array.from({ length: 7 }, () => kind));
		});
	},
);

describe('resetPassword.prepare on a type without a password', () => {
	it('is a TypeError before anything is counted, as request is', async () => {
		const { store, calls } = recording();
		// A JavaScript caller: the type has no resetPassword in TypeScript.
		const auth = janus({ user: person, store, hasher }) as unknown as {
			resetPassword: { prepare(email: string): Promise<unknown> };
		};

		const refused = await rejection(auth.resetPassword.prepare(ada.email));

		expect(refused).toBeInstanceOf(TypeError);
		expect((refused as Error).message).toBe(
			'resetPassword.prepare: the user type does not sign in with a password — add password: { login } to it',
		);
		expect(calls).toEqual([]);
	});
});
