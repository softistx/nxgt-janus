import { describe, expect, test } from 'bun:test';
import type { Rendered } from '@nxgt/mail';
import { baseOptions } from '../test/setup';
import { janusMail } from './janus-mail';
import { janusTemplates } from './templates';
import type { JanusMailTemplates } from './types';

const ada = { name: 'Ada', email: 'ada@example.com' };

describe('recoveryCodeUsed', () => {
	test('writes the count as the preset plural, in the recipient locale', async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		await mail.recoveryCodeUsed(ada, { when: 'today', recoveryCodesLeft: 1 });
		await mail.recoveryCodeUsed(
			{ ...ada, locale: 'fr-CA' },
			{ when: "aujourd'hui", recoveryCodesLeft: 0 },
		);
		const [en, fr] = options.mailer.sent;
		expect(en?.text).toContain('at today.');
		expect(en?.text).toContain('You have 1 recovery code left.');
		expect(fr?.text).toContain("le aujourd'hui.");
		expect(fr?.text).toContain('Il ne vous reste aucun code de récupération.');
	});

	test('sends the sentence as given when it is text', async () => {
		const options = baseOptions();
		await janusMail(options).recoveryCodeUsed(ada, {
			when: 'today',
			recoveryCodesLeft: 'Only a few codes are left <3',
		});
		const [sent] = options.mailer.sent;
		expect(sent?.text).toContain('Only a few codes are left <3');
		expect(sent?.html).toContain('Only a few codes are left &lt;3');
	});

	for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null]) {
		test(`refuses ${String(count)} as the count, and sends nothing`, async () => {
			const options = baseOptions();
			const error = await janusMail(options)
				.recoveryCodeUsed(ada, {
					when: 'today',
					recoveryCodesLeft: count as never,
				})
				.then(
					() => null,
					(e: unknown) => e,
				);
			expect(error).toEqual(
				new TypeError(
					'janusMail.recoveryCodeUsed: recoveryCodesLeft must be a count — a whole number, 0 or more — or the sentence to show',
				),
			);
			expect(options.mailer.attempts).toBe(0);
		});
	}

	describe('in a locale the defaults are not built in', () => {
		const own = (variables: { recoveryCodesLeft: string }): Rendered => ({
			subject: 'Wiederherstellungscode',
			html: `<p>${variables.recoveryCodesLeft}</p>`,
			text: variables.recoveryCodesLeft,
		});
		const templates = {
			...janusTemplates(),
			recoveryCodeUsed: own,
		} as unknown as JanusMailTemplates<'en' | 'fr' | 'de'>;
		const german = { ...ada, locale: 'de' };

		test('a count is a TypeError: the build has no plural for it', async () => {
			const options = baseOptions();
			const mail = janusMail({
				...options,
				locales: ['en', 'fr', 'de'],
				templates,
			});
			const error = await mail
				.recoveryCodeUsed(german, { when: 'heute', recoveryCodesLeft: 3 })
				.then(
					() => null,
					(e: unknown) => e,
				);
			expect(error).toEqual(
				new TypeError(
					'janusMail.recoveryCodeUsed: recoveryCodesLeft must be the sentence to show in a locale the default e-mails are not built in',
				),
			);
			expect(options.mailer.attempts).toBe(0);
		});

		test('the sentence is handed to the template as is', async () => {
			const options = baseOptions();
			const mail = janusMail({
				...options,
				locales: ['en', 'fr', 'de'],
				templates,
			});
			await mail.recoveryCodeUsed(german, {
				when: 'heute',
				recoveryCodesLeft: 'Sie haben noch 3 Wiederherstellungscodes.',
			});
			expect(options.mailer.sent[0]?.text).toBe(
				'Sie haben noch 3 Wiederherstellungscodes.',
			);
		});
	});
});
