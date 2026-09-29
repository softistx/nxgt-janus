import { describe, expect, test } from 'bun:test';
import {
	createMemoryStores,
	fixedClock,
	janus,
	scryptHasher,
	type UserEvent,
} from '@nxgt/janus';
import { z } from 'zod';
import { baseOptions } from '../test/setup';
import { janusMail } from './janus-mail';

// The new sign-in notice, wired as a consumer wires it: from the sign-in's
// own answer, where the request is in hand to describe the device, and from
// the user.newDeviceSignedIn event, which names the user by id alone.

const ada = { name: 'Ada', email: 'ada@example.com', locale: 'fr' };
const device = 'Firefox sur macOS';
const time = '29 septembre 2026 à 09:12';

function wired() {
	const options = baseOptions();
	const mail = janusMail(options);
	const heard: UserEvent[] = [];
	const auth = janus({
		user: z.strictObject({
			email: z.email(),
			name: z.string(),
			locale: z.string(),
		}),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }),
		clock: fixedClock(Date.UTC(2026, 8, 29, 7, 12)),
		devices: {
			keys: [{ id: 'd1', key: Buffer.alloc(32, 7).toString('base64') }],
		},
		events: (event) => void heard.push(event),
	});
	return { auth, mail, mailer: options.mailer, heard };
}

describe('janusMail().newSignIn', () => {
	test('sent from the answer of a sign-in on a new device, to the user', async () => {
		const { auth, mail, mailer } = wired();
		await auth.signUp({ ...ada, password: 'correct horse' }, { device: null });

		const signedIn = await auth.signIn(
			{ email: ada.email, password: 'correct horse' },
			{ device: null },
		);
		if (signedIn.newDevice) {
			const { user } = signedIn;
			await mail.newSignIn(
				{ name: user.name, email: user.email, locale: user.locale },
				{ device, time, location: 'Lyon, France' },
			);
		}

		const { sent } = mailer;
		expect(sent).toHaveLength(1);
		const [notice] = sent;
		expect(notice?.to).toBe(ada.email);
		expect(notice?.subject).toBe('Nouvelle connexion à votre compte');
		for (const part of [notice?.html, notice?.text]) {
			expect(part).toContain(device);
			expect(part).toContain(time);
			expect(part).toContain('Lyon, France');
			expect(part).toContain('https://acme.example/account/security');
		}
	});

	test('sent on the event, the user read back by id; no location shows —', async () => {
		const { auth, mail, mailer, heard } = wired();
		await auth.signUp({ ...ada, password: 'correct horse' }, { device: null });
		await auth.signIn(
			{ email: ada.email, password: 'correct horse' },
			{ device: null },
		);

		for (const event of heard) {
			if (event.type !== 'user.newDeviceSignedIn') continue;
			const user = await auth.get(event.userId);
			await mail.newSignIn(
				{ name: user.name, email: user.email, locale: 'en' },
				{ device, time: 'September 29, 2026 at 9:12 AM' },
			);
		}

		const { sent } = mailer;
		expect(sent).toHaveLength(1);
		expect(sent[0]?.subject).toBe('New sign-in to your account');
		expect(sent[0]?.text).toContain('Location\n—');
	});

	test('the values are text: markup in them is escaped in the html', async () => {
		const options = baseOptions();
		await janusMail(options).newSignIn(ada, {
			device: '<b>Firefox</b>',
			time,
		});
		const [notice] = options.mailer.sent;
		expect(notice?.html).toContain('&lt;b&gt;Firefox&lt;/b&gt;');
		expect(notice?.text).toContain('<b>Firefox</b>');
	});

	test('a device, a time or a location that is not text is a TypeError naming it', async () => {
		const mail = janusMail(baseOptions());
		const refused = (signIn: unknown) =>
			mail.newSignIn(ada, signIn as { device: string; time: string }).then(
				() => {
					throw new Error('expected a rejection');
				},
				(error: unknown) => error,
			);

		expect(await refused({ time })).toEqual(
			new TypeError('janusMail.newSignIn: device must be a string'),
		);
		expect(await refused({ device, time: new Date() })).toEqual(
			new TypeError('janusMail.newSignIn: time must be a string'),
		);
		expect(await refused({ device, time, location: null })).toEqual(
			new TypeError('janusMail.newSignIn: location must be a string'),
		);
	});
});
