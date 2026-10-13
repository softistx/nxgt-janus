import { describe, expect, test } from 'bun:test';
import { createMemoryStores, fixedClock, janus } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { z } from 'zod';
import {
	baseOptions,
	emailChange,
	links,
	partsOf,
	rejection,
} from '../test/setup';
import { janusMail } from './janus-mail';

const ada = { name: 'Ada' };

describe('changeEmail', () => {
	test('sends the confirmation to issued.email, the new address, its token only in the link', async () => {
		const options = baseOptions();
		await janusMail(options).changeEmail(emailChange, ada);

		const sent = options.mailer.sent[0];
		expect(sent?.to).toBe('ada@new.example');
		expect(sent?.subject).toBe('Confirm your new e-mail address');
		const href = 'https://acme.example/account/email?token=tok-change-321';
		expect(sent?.html).toContain(`href="${href}"`);
		expect(sent?.text).toContain(href);
		expect(sent?.text).toContain('Hello Ada,');
		expect(sent?.text).toContain('This link expires in 1 hour.');
		const text = sent?.text ?? '';
		expect(text.split('tok-change-321').length - 1).toBe(
			text.split(href).length - 1,
		);
	});

	test('in the recipient locale, with the expiry the send passes', async () => {
		const options = baseOptions();
		await janusMail(options).changeEmail(
			emailChange,
			{ ...ada, locale: 'fr-CA' },
			{ expiresIn: 'un quart d’heure' },
		);

		const sent = options.mailer.sent[0];
		expect(sent?.subject).toBe('Confirmez votre nouvelle adresse e-mail');
		expect(partsOf(sent).join('\n')).toContain('un quart d’heure');
	});

	test('says how long is left until expiresAt, and refuses one already past', async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		await mail.changeEmail(emailChange, ada);
		expect(options.mailer.sent[0]?.text).toContain('1 hour');

		const past = {
			...emailChange,
			expiresAt: new Date('2026-09-27T10:00:00Z'),
		};
		expect(await rejection(mail.changeEmail(past, ada))).toMatchObject({
			message: expect.stringContaining(
				'janusMail.changeEmail: expiresAt is past',
			),
		});
		expect(options.mailer.sent).toHaveLength(1);
	});

	test('throws a TypeError, and sends nothing, without links.changeEmail', async () => {
		const options = baseOptions();
		const { changeEmail: _, ...withoutIt } = links;
		const mail = janusMail({ ...options, links: withoutIt });

		const error = await rejection(mail.changeEmail(emailChange, ada));

		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.changeEmail: links.changeEmail is missing — pass it to janusMail({ links }) to send e-mail change links',
		);
		expect(options.mailer.sent).toHaveLength(0);
	});

	test('the other e-mails still send without links.changeEmail', async () => {
		const options = baseOptions();
		const { changeEmail: _, ...withoutIt } = links;
		await janusMail({ ...options, links: withoutIt }).welcome({
			name: 'Ada',
			email: 'ada@example.com',
		});
		expect(options.mailer.sent).toHaveLength(1);
	});

	test('refuses a links.changeEmail that is not a function when janusMail() is called', () => {
		expect(() =>
			janusMail({
				...baseOptions(),
				links: { ...links, changeEmail: 'https://acme.example' as never },
			}),
		).toThrow('janusMail: links.changeEmail must be a function, or left out');
	});

	test('refuses a token that is not a string, a name that is not one, and a link that is not one', async () => {
		const mail = janusMail(baseOptions());
		const asyncLink = janusMail({
			...baseOptions(),
			links: { ...links, changeEmail: (async () => 'x') as never },
		});

		expect(
			await rejection(
				mail.changeEmail({ ...emailChange, token: 7 as never }, ada),
			),
		).toMatchObject({
			message: 'janusMail.changeEmail: token must be a string',
		});
		expect(
			await rejection(mail.changeEmail(emailChange, {} as never)),
		).toMatchObject({
			message: 'janusMail.changeEmail: name must be a string',
		});
		expect(
			await rejection(asyncLink.changeEmail(emailChange, ada)),
		).toMatchObject({
			message:
				'janusMail.changeEmail: links.changeEmail(token) must answer a string',
		});
	});

	test('a template of your own replaces the default', async () => {
		const options = baseOptions();
		const mail = janusMail({
			...options,
			templates: {
				changeEmail: ({ link, name }) => ({
					subject: `New address, ${name}`,
					html: `<a href="${link}">ok</a>`,
					text: link,
				}),
			},
		});
		await mail.changeEmail(emailChange, ada);
		expect(options.mailer.sent[0]?.subject).toBe('New address, Ada');
	});

	test('sends what changeEmail.send answered, and its link moves the account', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 28, 9));
		const auth = janus({
			user: z.strictObject({ email: z.email(), name: z.string() }),
			store: createMemoryStores(),
			clock,
		});
		const mailer = createMemoryMailer();
		const mail = janusMail({ ...baseOptions(), mailer, clock });
		const user = await auth.create({ email: 'ada@example.com', name: 'Ada' });

		const issued = await auth.changeEmail.send(user, 'ada@new.example');
		await mail.changeEmail(issued, { name: user.name });

		expect(mailer.sent[0]?.to).toBe('ada@new.example');
		const token =
			/token=([A-Za-z0-9_-]+)/.exec(mailer.sent[0]?.text ?? '')?.[1] ?? '';
		const confirmed = await auth.changeEmail.confirm(token);
		expect(confirmed.email).toBe('ada@new.example');
	});
});
