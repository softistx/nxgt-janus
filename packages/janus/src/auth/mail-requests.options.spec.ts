import { describe, expect, it } from 'bun:test';
import { ada } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { StoreFailure } from '../errors/janus-error';
import { mailing, signedUp, times } from './mail-requests.fixtures';
import { createMemoryStores } from './port/memory';

describe('mail.throttle', () => {
	it('counts nothing with false: every request is answered', async () => {
		const context = mailing({ mail: { throttle: false } });
		const { auth, issued } = context;
		const user = await signedUp(context);

		await times(20, () => auth.magicLink.request(ada.email));
		await times(20, () => auth.signInCode.request(ada.email));
		await times(20, () => auth.resetPassword.request(ada.email));
		await times(20, () => auth.verifyEmail.send(user));
		await times(20, () => auth.stepUp.request(user));
		const nobody = await times(20, () =>
			auth.magicLink.request('nobody@example.test'),
		);

		expect(issued).toHaveLength(100);
		expect(nobody.every((answer) => answer === null)).toBe(true);
	});

	it('takes its own limit and window', async () => {
		const context = mailing({
			mail: { throttle: { attempts: 2, window: '1h' } },
		});
		const { auth, clock } = context;
		await signedUp(context);

		await times(2, () => auth.signInCode.request(ada.email));
		expect(await rejection(auth.signInCode.request(ada.email))).toMatchObject({
			code: 'MAIL_THROTTLED',
			retryAfter: 3600,
		});
		clock.advance(3_600_000);
		expect(await auth.signInCode.request(ada.email)).not.toBeNull();
	});

	it('fails with STORE_FAILED when the store cannot count, and issues nothing', async () => {
		const memory = createMemoryStores();
		const context = mailing({
			store: {
				...memory,
				tokens: {
					...memory.tokens,
					async countAttempt() {
						throw new Error('connection reset');
					},
				},
			},
		});
		const { auth, issued } = context;
		await signedUp(context);

		const error = await rejection(auth.magicLink.request(ada.email));

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({ code: 'STORE_FAILED' });
		expect(issued).toEqual([]);
	});
});
