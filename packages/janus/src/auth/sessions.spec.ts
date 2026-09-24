import { describe, expect, it } from 'bun:test';
import {
	ada,
	bearer,
	clinic,
	password,
	rejection,
	setup,
} from '../../test/auth';
import type { JanusError } from '../errors/janus-error';
import { presentedToken } from './sessions';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('authenticate', () => {
	it('answers the user and the session a request presents, and null for none', async () => {
		const { auth } = setup();
		const { user, token } = await auth.signUp({ ...ada, password });

		const current = await auth.authenticate(bearer(token));

		expect(current?.user.id).toBe(user.id);
		expect(current?.token).toBe(token);
		expect(current?.renewed).toBe(false);
		expect(await auth.authenticate(new Headers())).toBeNull();
		expect(await auth.authenticate(bearer('forged'))).toBeNull();
	});

	it('reads a Request, Headers, a Node-style request and a plain record alike', async () => {
		const { auth } = setup();
		const { token } = await auth.signUp({ ...ada, password });

		for (const request of [
			new Request('https://app.test', {
				headers: { cookie: `janus-session=${token}` },
			}),
			bearer(token),
			{ headers: { 'x-session-token': token } },
			{ authorization: `Bearer ${token}` },
		]) {
			expect(await auth.authenticate(request)).not.toBeNull();
		}
	});

	it('is anonymous once the session lapsed or was revoked, or the user deactivated', async () => {
		const { auth, clock } = setup();
		const lapsing = await auth.signUp({ ...ada, password });
		const revoked = await auth.signIn({ email: ada.email, password });
		const other = await auth.signUp({
			email: 'grace@example.test',
			name: 'Grace',
			password,
		});

		await auth.signOut(bearer(revoked.token));
		await auth.setActive(other.user, false);
		clock.advance(7 * DAY);

		expect(await auth.authenticate(bearer(lapsing.token))).toBeNull();
		expect(await auth.authenticate(bearer(revoked.token))).toBeNull();
		expect(await auth.authenticate(bearer(other.token))).toBeNull();
	});

	it('renews a sliding session once renewAfter has passed, and at most once per period', async () => {
		const { auth, clock } = setup();
		const { token, session } = await auth.signUp({ ...ada, password });

		clock.advance(12 * HOUR);
		const early = await auth.authenticate(bearer(token));
		clock.advance(12 * HOUR);
		const due = await auth.authenticate(bearer(token));
		clock.advance(HOUR);
		const after = await auth.authenticate(bearer(token));

		expect(early?.renewed).toBe(false);
		expect(early?.session.expiresAt).toEqual(session.expiresAt);
		expect(due?.renewed).toBe(true);
		expect(due?.session.expiresAt).toEqual(
			new Date(clock.now().getTime() - HOUR + 7 * DAY),
		);
		expect(after?.renewed).toBe(false);
	});

	it('keeps a fixed lifespan when renewAfter is false', async () => {
		const { auth, clock } = clinic();
		const { token } = await auth.staff.signUp({
			username: 'grace',
			service: 'navy',
			password,
		});

		clock.advance(7 * HOUR);
		expect((await auth.authenticate(bearer(token)))?.renewed).toBe(false);
		clock.advance(HOUR);
		expect(await auth.authenticate(bearer(token))).toBeNull();
	});

	it('answers null for a user of another type than asked for', async () => {
		const { auth } = clinic();
		const { token } = await auth.patient.signUp({
			email: 'ada@example.test',
			birthDate: '1815-12-10',
			password,
		});

		expect(
			await auth.authenticate(bearer(token), { type: 'staff' }),
		).toBeNull();
		expect(
			(await auth.authenticate(bearer(token), { type: 'patient' }))?.user
				.birthDate,
		).toBe('1815-12-10');
	});
});

describe('signing out', () => {
	it('revokes the session a request presents', async () => {
		const { auth } = setup();
		const { token } = await auth.signUp({ ...ada, password });

		expect(await auth.signOut(bearer(token))).toBe(true);
		expect(await auth.authenticate(bearer(token))).toBeNull();
		expect(await auth.signOut(new Headers())).toBe(false);
		expect(await auth.signOut(bearer('forged'))).toBe(false);
	});

	it('signs out everywhere else', async () => {
		const { auth } = setup();
		const here = await auth.signUp({ ...ada, password });
		const there = await auth.signIn({ email: ada.email, password });
		const elsewhere = await auth.signIn({ email: ada.email, password });

		expect(
			await auth.signOutEverywhere(here.user, { except: here.session.id }),
		).toBe(2);
		expect(await auth.authenticate(bearer(here.token))).not.toBeNull();
		expect(await auth.authenticate(bearer(there.token))).toBeNull();
		expect(await auth.authenticate(bearer(elsewhere.token))).toBeNull();
		expect(await auth.signOutEverywhere('not-an-id')).toBe(0);
	});

	it('collects lapsed sessions when the store can, and says UNSUPPORTED when it cannot', async () => {
		const { createMemoryStores } = await import('./port/memory');
		const { deleteExpiredSessions: _, ...withoutCollect } =
			createMemoryStores().sessions;
		const { auth, clock } = setup();
		await auth.signUp({ ...ada, password });
		clock.advance(8 * DAY);

		expect(await auth.collectExpired()).toBe(1);

		const store = { ...createMemoryStores(), sessions: withoutCollect };
		const error = (await rejection(
			setup({ store }).auth.collectExpired(),
		)) as JanusError;
		expect(error.code).toBe('UNSUPPORTED');
		expect(error.slot).toBe('sessions');
	});
});

describe('presentedToken', () => {
	it('takes the first credential PRESENT, not the first valid one', () => {
		expect(
			presentedToken(
				{
					authorization: 'Bearer lapsed',
					'x-session-token': 'header',
					cookie: 'janus-session=live',
				},
				'janus-session',
			),
		).toBe('lapsed');
		expect(
			presentedToken(
				new Headers({
					'X-Session-Token': 'header',
					cookie: 'janus-session=live',
				}),
				'janus-session',
			),
		).toBe('header');
		expect(
			presentedToken(
				{ cookie: 'a=1; janus-session=live; b=2' },
				'janus-session',
			),
		).toBe('live');
	});

	it('does not count another Authorization scheme as a session credential', () => {
		expect(
			presentedToken(
				{ authorization: 'Basic dXNlcjpwdw==', cookie: 'janus-session=live' },
				'janus-session',
			),
		).toBe('live');
	});

	it('answers null when nothing is presented', () => {
		expect(presentedToken({}, 'janus-session')).toBeNull();
		expect(presentedToken({ cookie: 'other=1' }, 'janus-session')).toBeNull();
	});
});

describe('cookie', () => {
	it('is strict by default: HttpOnly, Secure, SameSite=Lax', async () => {
		const { auth } = setup();
		const { token, session } = await auth.signUp({ ...ada, password });

		expect(auth.cookie.serialize(token, session)).toBe(
			`janus-session=${token}; Expires=${session.expiresAt.toUTCString()}; Path=/; HttpOnly; SameSite=Lax; Secure`,
		);
		expect(auth.cookie.clear()).toBe(
			'janus-session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
		);
	});
});
