import { describe, expect, it } from 'bun:test';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { collect } from '../../test/collect';
import { email, password, totp } from './flows.fixtures';
import { instrumentJanus } from './index';

function withDevices() {
	return instrumentJanus(
		janus({
			user: z.strictObject({ email: z.email() }),
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher: scryptHasher({ cost: 10 }),
			secondFactor: {
				issuer: 'Clinic',
				keys: [{ id: 'k1', key: Buffer.alloc(32, 1).toString('base64') }],
			},
			devices: {
				keys: [{ id: 'd1', key: Buffer.alloc(32, 7).toString('base64') }],
			},
		}),
	);
}

describe('instrumentJanus()', () => {
	it('marks a sign-in from a new device — never the device token', async () => {
		const auth = withDevices();
		const { deviceToken } = await auth.signUp(
			{ email, password },
			{ device: null },
		);
		const tokens: string[] = [deviceToken as string];
		const { logs, all } = await collect(async () => {
			const known = await auth.signIn(
				{ email, password },
				{ device: deviceToken },
			);
			const fresh = await auth.signIn({ email, password }, { device: null });
			tokens.push(fresh.deviceToken as string, known.token, fresh.token);
		});

		const signedIn = logs.filter((log) => log.name === 'janus.signIn');
		expect(
			signedIn.map((log) => log.attributes['janus.signIn.newDevice']),
		).toEqual([undefined, true]);
		const written = JSON.stringify(all);
		for (const token of tokens) expect(written).not.toContain(token);
	});

	it('marks it from every sign-in that opens a session: code, link, second factor, recovery code', async () => {
		const auth = withDevices();
		const fresh = { device: null } as const;
		const { user } = await auth.signUp({ email, password });
		// Proved first: a first proof by code or link would remove the factor.
		await auth.verifyEmail.confirm((await auth.verifyEmail.send(user)).token);
		const tokens: string[] = [];
		const { logs, all } = await collect(async () => {
			const issued = await auth.signInCode.request(email);
			const link = await auth.magicLink.request(email);
			if (issued === null || link === null) throw new Error('expected both');
			const byCode = await auth.signInCode.confirm(
				issued.challenge,
				issued.code,
				fresh,
			);
			const byLink = await auth.magicLink.confirm(link.token, fresh);
			tokens.push(byCode.deviceToken as string, byLink.deviceToken as string);

			const { secret } = await auth.secondFactor.enroll(user);
			const { recoveryCodes } = await auth.secondFactor.activate(
				user,
				totp(secret, Date.now()),
			);
			const asked = await auth.signIn({ email, password });
			if (asked.status !== 'secondFactor') throw new Error('a challenge');
			// The next step's code: the one activation used is spent.
			const code = totp(secret, Date.now() + 30_000);
			const confirmed = await auth.secondFactor.confirm(
				asked.challenge,
				code,
				fresh,
			);
			const again = await auth.signIn({ email, password });
			if (again.status !== 'secondFactor') throw new Error('a challenge');
			const recovered = await auth.secondFactor.recover(
				again.challenge,
				recoveryCodes[0] as string,
				fresh,
			);
			tokens.push(
				confirmed.deviceToken as string,
				recovered.deviceToken as string,
			);
		});

		const signedIn = logs.filter((log) => log.name === 'janus.signIn');
		expect(signedIn.map((log) => log.attributes)).toEqual([
			expect.objectContaining({
				'janus.signIn.code': true,
				'janus.signIn.newDevice': true,
			}),
			expect.objectContaining({
				'janus.signIn.magicLink': true,
				'janus.signIn.newDevice': true,
			}),
			expect.objectContaining({
				'janus.signIn.secondFactor': true,
				'janus.signIn.newDevice': true,
			}),
			expect.objectContaining({
				'janus.signIn.recoveryCode': true,
				'janus.signIn.newDevice': true,
			}),
		]);
		const written = JSON.stringify(all);
		for (const token of tokens) expect(written).not.toContain(token);
	});
});
