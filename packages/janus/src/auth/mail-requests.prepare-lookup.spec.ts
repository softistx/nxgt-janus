import { describe, expect, it } from 'bun:test';
import { ada } from '../../test/auth';
import { rejection } from '../../test/rejection';
import {
	mailing,
	preparedFlows,
	recording,
	signedUp,
} from './mail-requests.fixtures';

const nobody = 'nobody@example.test';

describe.each([...preparedFlows])(
	'$flow.prepare, the same work for any address',
	({ prepare }) => {
		it('looks nobody up: no call reaches the users store', async () => {
			const { store, calls } = recording();
			const context = mailing({ store });
			await signedUp(context);
			calls.length = 0;

			await prepare(context.auth, ada.email);

			expect(calls.filter((call) => call.startsWith('users.'))).toEqual([]);
			expect(calls.length).toBeGreaterThan(0);
		});

		it('makes the same store calls for an address held and one nobody holds', async () => {
			const held = recording();
			const known = mailing({ store: held.store });
			await signedUp(known);
			held.calls.length = 0;
			const free = recording();
			const unknown = mailing({ store: free.store });
			await signedUp(unknown);
			free.calls.length = 0;

			await prepare(known.auth, ada.email);
			await prepare(unknown.auth, nobody);

			expect(free.calls).toEqual(held.calls);
		});

		it('looks the address up in send, and only there', async () => {
			const { store, calls } = recording();
			const context = mailing({ store });
			await signedUp(context);
			const pending = await prepare(context.auth, ada.email);
			calls.length = 0;

			await pending.send();

			expect(calls).toContain('users.findUserByLogin');
		});

		it('with the throttle off, touches no store at all', async () => {
			const { store, calls } = recording();
			const context = mailing({ store, mail: { throttle: false } });
			await signedUp(context);
			calls.length = 0;

			await prepare(context.auth, ada.email);
			await prepare(context.auth, nobody);

			expect(calls).toEqual([]);
		});
	},
);

describe('signInCode.prepare, its challenge', () => {
	it('is the challenge send issues the code under, and confirms', async () => {
		const context = mailing();
		const { auth } = context;
		await signedUp(context);

		const pending = await auth.signInCode.prepare(ada.email);
		const issued = await pending.send();
		if (issued === null) throw new Error('expected a code');

		expect(issued.challenge).toBe(pending.challenge);
		const signedIn = await auth.signInCode.confirm(
			pending.challenge,
			issued.code,
		);
		expect(signedIn.user.email).toBe(ada.email);
	});

	it('is minted for an address nobody holds too, and is TOKEN_UNKNOWN there', async () => {
		const { auth } = mailing();

		const pending = await auth.signInCode.prepare(nobody);
		expect(pending.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await pending.send()).toBeNull();

		const refused = await rejection(
			auth.signInCode.confirm(pending.challenge, '000000'),
		);
		expect(refused).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});

	it('differs from one prepare to the next', async () => {
		const { auth } = mailing();
		const first = await auth.signInCode.prepare(nobody);
		const second = await auth.signInCode.prepare(nobody);
		expect(first.challenge).not.toBe(second.challenge);
	});
});
