import { describe, expect, it } from 'bun:test';
import { ada, hasher, person } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { fixedClock } from '../time/clock';
import { janus } from './janus';
import {
	byAddress,
	type Mailing,
	mailing,
	signedUp,
	times,
	WINDOW_MS,
} from './mail-requests.fixtures';
import { createMemoryStores } from './port/memory';

type Auth = Mailing['auth'];
type Request = (auth: Auth, email: string) => Promise<unknown>;

/** The three requests anybody can make with an address, counted per address. */
const flows = [
	[
		'magicLink.request',
		'magicLink',
		((auth, email) => auth.magicLink.request(email)) as Request,
	],
	[
		'signInCode.request',
		'signInCode',
		((auth, email) => auth.signInCode.request(email)) as Request,
	],
	[
		'resetPassword.request',
		'resetPassword',
		((auth, email) => auth.resetPassword.request(email)) as Request,
	],
] as const;

const nobody = 'nobody@example.test';

describe.each(flows)('%s, throttled per address', (where, kind, request) => {
	it('issues five, then refuses with MAIL_THROTTLED and retryAfter, issuing nothing', async () => {
		const context = mailing();
		const { auth, clock, issued } = context;
		await signedUp(context);

		const answers = await times(5, () => request(auth, ada.email));
		for (const answer of answers) {
			expect(answer).toMatchObject({ email: ada.email });
		}
		expect(issued).toEqual(Array.from({ length: 5 }, () => kind));

		clock.advance(60_000);
		const refused = await rejection(request(auth, ada.email));
		expect(refused).toMatchObject({
			name: 'MailThrottledError',
			code: 'MAIL_THROTTLED',
			retryAfter: 540,
			userType: 'user',
			message: byAddress(where),
		});
		// No user is named: the refusal is the same for an address nobody holds.
		expect((refused as { userId?: unknown }).userId).toBeUndefined();
		expect(issued).toHaveLength(5);
	});

	it('issues again once the window ends: nothing locks', async () => {
		const context = mailing();
		const { auth, clock } = context;
		await signedUp(context);
		await times(6, () => request(auth, ada.email));

		clock.advance(WINDOW_MS);

		expect(await request(auth, ada.email)).not.toBeNull();
	});

	it('counts an address nobody holds alike, and refuses it alike', async () => {
		const context = mailing();
		const { auth, issued } = context;
		await signedUp(context);

		const unknown = await times(6, () => request(auth, nobody));
		const known = await times(6, () => request(auth, ada.email));

		// Answered as today under the limit: null, and nothing issued.
		expect(unknown.slice(0, 5)).toEqual([null, null, null, null, null]);
		expect(unknown[5]).toEqual({ refused: 'MAIL_THROTTLED' });
		expect(known[5]).toEqual({ refused: 'MAIL_THROTTLED' });
		const [one, two] = [
			await rejection(request(auth, nobody)),
			await rejection(request(auth, ada.email)),
		];
		const shape = (error: unknown) => {
			const { code, message, retryAfter, userType, userId, reason } =
				error as Record<string, unknown>;
			return { code, message, retryAfter, userType, userId, reason };
		};
		expect(shape(one)).toEqual(shape(two));
		expect(issued).toHaveLength(5);
	});

	it('counts the address normalised: case and spaces are one count', async () => {
		const context = mailing();
		const { auth } = context;
		await signedUp(context);
		await times(5, () => request(auth, '  ADA@example.test '));

		expect(await rejection(request(auth, ada.email))).toMatchObject({
			code: 'MAIL_THROTTLED',
		});
	});

	it('issues exactly five of twenty requests made at once', async () => {
		const context = mailing();
		const { auth, issued } = context;
		await signedUp(context);

		const outcomes = await Promise.all(
			Array.from({ length: 20 }, () =>
				request(auth, ada.email).then(
					() => 'issued',
					(error: { code?: unknown }) => error.code,
				),
			),
		);

		expect(outcomes.filter((outcome) => outcome === 'issued')).toHaveLength(5);
		expect(
			outcomes.filter((outcome) => outcome === 'MAIL_THROTTLED'),
		).toHaveLength(15);
		expect(issued).toHaveLength(5);
	});

	it('leaves another address alone', async () => {
		const context = mailing();
		const { auth } = context;
		await signedUp(context);
		await times(6, () => request(auth, nobody));

		expect(await request(auth, ada.email)).not.toBeNull();
	});
});

describe('the requests by address, together', () => {
	it('count each flow on its own: a loop on one shuts no other', async () => {
		const context = mailing();
		const { auth } = context;
		await signedUp(context);
		await times(6, () => auth.magicLink.request(ada.email));

		expect(await auth.signInCode.request(ada.email)).not.toBeNull();
		expect(await auth.resetPassword.request(ada.email)).not.toBeNull();
	});

	it('spend nothing when refused: the last link issued still signs in', async () => {
		const context = mailing();
		const { auth } = context;
		await signedUp(context);
		const links = await times(5, () => auth.magicLink.request(ada.email));
		await rejection(auth.magicLink.request(ada.email));

		const last = links[4] as { readonly token: string };
		const signedIn = await auth.magicLink.confirm(last.token);
		expect(signedIn.status).toBe('signedIn');
	});
});

describe('the count per address, across user types', () => {
	it('is one count: asking through another type buys no more e-mails', async () => {
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				staff: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
			clock: fixedClock(Date.UTC(2026, 8, 23)),
		});
		await times(5, () => auth.patient.magicLink.request(ada.email));

		expect(
			await rejection(auth.staff.magicLink.request(ada.email)),
		).toMatchObject({
			code: 'MAIL_THROTTLED',
			userType: 'staff',
			message: byAddress('staff.magicLink.request'),
		});
	});
});
