import { describe, expect, test } from 'bun:test';
import { createMemoryStores, fixedClock, janus } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { z } from 'zod';
import {
	baseOptions,
	links,
	partsOf,
	rejection,
	signInLink,
} from '../test/setup';
import { janusMail } from './janus-mail';

describe('magicLink', () => {
	test('sends the sign-in link to issued.email, its token only in the link', async () => {
		const options = baseOptions();
		await janusMail(options).magicLink(signInLink);

		const sent = options.mailer.sent[0];
		expect(sent?.to).toBe('ada@example.com');
		expect(sent?.subject).toBe('Your sign-in link');
		const href = 'https://acme.example/sign-in/link?token=tok-link-789';
		expect(sent?.html).toContain(`href="${href}"`);
		expect(sent?.text).toContain(href);
		expect(sent?.text).toContain('This link expires in 1 hour.');
		expect(sent?.text).toContain('Sign in to Acme');
		// The token reaches the e-mail through the link, and nowhere else.
		const text = sent?.text ?? '';
		expect(text.split('tok-link-789').length - 1).toBe(
			text.split(href).length - 1,
		);
	});

	test('in the recipient locale, with the expiry the send passes', async () => {
		const options = baseOptions();
		await janusMail(options).magicLink(
			signInLink,
			{ locale: 'fr-CA' },
			{ expiresIn: 'un quart d’heure' },
		);

		const sent = options.mailer.sent[0];
		expect(sent?.subject).toBe('Votre lien de connexion');
		expect(partsOf(sent).join('\n')).toContain('un quart d’heure');
	});

	test('throws a TypeError, and sends nothing, without links.magicLink', async () => {
		const options = baseOptions();
		const { magicLink: _, ...withoutIt } = links;
		const mail = janusMail({ ...options, links: withoutIt });

		const error = await rejection(mail.magicLink(signInLink));

		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.magicLink: links.magicLink is missing — pass it to janusMail({ links }) to send sign-in links',
		);
		expect(options.mailer.sent).toHaveLength(0);
	});

	test('refuses a links.magicLink that is not a function when janusMail() is called', () => {
		expect(() =>
			janusMail({
				...baseOptions(),
				links: { ...links, magicLink: 'https://acme.example' as never },
			}),
		).toThrow('janusMail: links.magicLink must be a function, or left out');
	});

	test('refuses a token that is not a string, and a link that is not one', async () => {
		const mail = janusMail(baseOptions());
		const asyncLink = janusMail({
			...baseOptions(),
			links: { ...links, magicLink: (async () => 'x') as never },
		});

		expect(
			await rejection(mail.magicLink({ ...signInLink, token: 7 as never })),
		).toMatchObject({ message: 'janusMail.magicLink: token must be a string' });
		expect(await rejection(asyncLink.magicLink(signInLink))).toMatchObject({
			message:
				'janusMail.magicLink: links.magicLink(token) must answer a string',
		});
	});

	test('sends what auth.magicLink.request answered, and its link signs in', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 28, 9));
		const auth = janus({
			user: z.strictObject({ email: z.email() }),
			store: createMemoryStores(),
			clock,
		});
		const mailer = createMemoryMailer();
		const mail = janusMail({ ...baseOptions(), mailer, clock });
		await auth.create({ email: 'ada@example.com' });

		const issued = await auth.magicLink.request('ada@example.com');
		if (issued === null) throw new Error('expected a link');
		await mail.magicLink(issued, { locale: 'fr' });

		const text = mailer.sent[0]?.text ?? '';
		expect(text).toContain('15 minutes');
		const token = /token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';
		expect((await auth.magicLink.confirm(token)).user.emailVerified).toBe(true);
	});
});
