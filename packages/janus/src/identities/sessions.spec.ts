import { describe, expect, it } from 'bun:test';
import { ada, rejection, setup } from '../../test/identities';
import { type SessionError, UnsupportedError } from '../errors/janus-error';
import { requireAal } from './aal';
import { hashSecret } from './secrets';
import { presentedToken } from './sessions';

const HOUR = 3_600_000;

describe('sessions', () => {
	it('gives the token once, and stores only its hash', async () => {
		const { identities, stores } = setup();
		const identity = await identities.create({ traits: ada });

		const { token, session } = await identities.sessions.create(identity.id);

		expect('tokenHash' in session).toBe(false);
		const stored = await stores.sessions.findSessionByTokenHash(
			hashSecret(token),
		);
		expect(stored?.id).toBe(session.id);
		expect(JSON.stringify(stored)).not.toContain(token);
	});

	it('refuses a session for an inactive identity', async () => {
		const { identities } = setup();
		const identity = await identities.create({
			traits: ada,
			state: 'inactive',
		});

		const error = await rejection(identities.sessions.create(identity.id));

		expect((error as SessionError).code).toBe('IDENTITY_INACTIVE');
	});

	it('resolves a live session, and a lapsed or revoked one is anonymous', async () => {
		const { identities, clock } = setup();
		const identity = await identities.create({ traits: ada });
		const { token, session } = await identities.sessions.create(identity.id);
		const headers = { authorization: `Bearer ${token}` };

		expect((await identities.sessions.resolve(headers))?.identity.id).toBe(
			identity.id,
		);

		clock.advance(24 * HOUR);
		expect(await identities.sessions.resolve(headers)).toBeNull();

		clock.advance(-HOUR);
		await identities.sessions.revoke(session.id);
		expect(await identities.sessions.resolve(headers)).toBeNull();
	});

	it('answers IDENTITY_INACTIVE when the identity was deactivated under a live session', async () => {
		const { identities } = setup();
		const identity = await identities.create({ traits: ada });
		const { token } = await identities.sessions.create(identity.id);
		await identities.setState(identity.id, 'inactive');

		const error = await rejection(
			identities.sessions.resolve({ 'x-session-token': token }),
		);

		expect((error as SessionError).code).toBe('IDENTITY_INACTIVE');
	});

	it('extends only inside the refresh window, and never a revoked session', async () => {
		const { identities, clock } = setup();
		const identity = await identities.create({ traits: ada });
		const { session } = await identities.sessions.create(identity.id);

		// 23h left, window is 1h: answered as it is.
		clock.advance(HOUR);
		expect(await identities.sessions.extend(session)).toEqual(session);

		// 30 minutes left: extended by the lifespan, from now.
		clock.advance(22.5 * HOUR);
		const extended = await identities.sessions.extend(session);
		expect(extended?.expiresAt.getTime()).toBe(
			clock.now().getTime() + 24 * HOUR,
		);

		await identities.sessions.revoke(session.id);
		const revoked = {
			...session,
			expiresAt: new Date(clock.now().getTime() + 1000),
		};
		expect(await identities.sessions.extend(revoked)).toBeNull();
	});

	it('signs out everywhere else', async () => {
		const { identities } = setup();
		const identity = await identities.create({ traits: ada });
		const current = await identities.sessions.create(identity.id);
		const other = await identities.sessions.create(identity.id);

		expect(
			await identities.sessions.revokeAll(identity.id, {
				except: current.session.id,
			}),
		).toBe(1);
		expect(
			await identities.sessions.resolve({
				cookie: `janus-session=${current.token}`,
			}),
		).not.toBeNull();
		expect(
			await identities.sessions.resolve({
				cookie: `janus-session=${other.token}`,
			}),
		).toBeNull();
	});

	it('collects lapsed sessions when the store can, and says UNSUPPORTED when it cannot', async () => {
		const withCollect = setup();
		const identity = await withCollect.identities.create({ traits: ada });
		await withCollect.identities.sessions.create(identity.id);
		withCollect.clock.advance(25 * HOUR);
		expect(await withCollect.identities.sessions.collectExpired()).toBe(1);

		const { stores } = setup();
		const { deleteExpiredSessions: _, ...sessions } = stores.sessions;
		const without = setup({ stores: { ...stores, sessions } });

		const error = await rejection(without.identities.sessions.collectExpired());
		expect(error).toBeInstanceOf(UnsupportedError);
		expect((error as UnsupportedError).slot).toBe('sessions');
		expect((error as UnsupportedError).operation).toBe('deleteExpiredSessions');
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
		const { identities } = setup();
		const identity = await identities.create({ traits: ada });
		const { token, session } = await identities.sessions.create(identity.id);

		expect(identities.cookie.serialize(token, session)).toBe(
			`janus-session=${token}; Expires=${session.expiresAt.toUTCString()}; Path=/; HttpOnly; SameSite=Lax; Secure`,
		);
		expect(identities.cookie.clear()).toBe(
			'janus-session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
		);
	});
});

describe('requireAal', () => {
	it('refuses a session below the level, and names the level', () => {
		expect(() => requireAal({ aal: 'aal2' }, 'aal2')).not.toThrow();
		expect(() => requireAal({ aal: 'aal2' }, 'aal1')).not.toThrow();

		let error: unknown;
		try {
			requireAal({ aal: 'aal1' }, 'aal2');
		} catch (caught) {
			error = caught;
		}
		expect((error as SessionError).code).toBe('AAL_REQUIRED');
		expect((error as SessionError).requiredAal).toBe('aal2');
	});
});
