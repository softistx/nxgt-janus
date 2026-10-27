import { describe, expect, test } from 'bun:test';
import { baseOptions } from '../test/setup';
import { janusMail } from './janus-mail';

// The e-mail to the owner of an address someone tried to sign up with: sent
// by the application's own sign-up route when the address is taken, to the
// account that exists, with that account's name.

const ada = { name: 'Ada', email: 'ada@example.com', locale: 'fr' };

describe('janusMail().signUpAttempted', () => {
	test('tells the owner, in their locale, with the device, the time and the link', async () => {
		const options = baseOptions();
		const mail = janusMail(options);

		await mail.signUpAttempted(ada, {
			device: 'Firefox sur macOS',
			time: '29 septembre 2026 à 09:12',
		});

		const [sent] = options.mailer.sent;
		expect(options.mailer.sent).toHaveLength(1);
		expect(sent?.to).toBe(ada.email);
		expect(sent?.subject).toBe(
			"Quelqu'un a tenté de s'inscrire avec votre adresse e-mail",
		);
		for (const part of [sent?.html, sent?.text]) {
			expect(part).toContain('Ada');
			expect(part).toContain('Firefox sur macOS');
			expect(part).toContain('29 septembre 2026 à 09:12');
			expect(part).toContain('https://acme.example/start');
		}
	});

	test('without a device or a time: "Unknown" in the send locale', async () => {
		const options = baseOptions();
		const mail = janusMail(options);

		await mail.signUpAttempted({ ...ada, locale: 'en' });
		await mail.signUpAttempted(ada, { time: '09:12' });

		const [english, french] = options.mailer.sent;
		expect(english?.subject).toBe(
			'Someone tried to sign up with your e-mail address',
		);
		expect(english?.text).toContain('Device Unknown');
		expect(english?.text).toContain('Time Unknown');
		expect(french?.text).toContain('Appareil Inconnu');
		expect(french?.text).toContain('09:12');
	});

	test('a wrong argument rejects with a TypeError naming the method and the field', async () => {
		const mail = janusMail(baseOptions());
		const call = mail.signUpAttempted as unknown as (
			...args: unknown[]
		) => Promise<unknown>;

		await expect(call({ name: 'Ada' })).rejects.toThrow(
			'janusMail.signUpAttempted: email must be a string',
		);
		await expect(call(ada, { device: 42 })).rejects.toThrow(
			'janusMail.signUpAttempted: device must be a string',
		);
	});
});
