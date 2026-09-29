import { describe, expect, it } from 'bun:test';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { collect } from '../../test/collect';
import { email, password } from './flows.fixtures';
import { instrumentJanus } from './index';

function withDevices() {
	return instrumentJanus(
		janus({
			user: z.strictObject({ email: z.email() }),
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher: scryptHasher({ cost: 10 }),
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
});
