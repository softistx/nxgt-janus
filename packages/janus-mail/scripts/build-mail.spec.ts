import { describe, expect, test } from 'bun:test';
import { EXPECTED_EMAILS, emailsProblem, localesModule } from './build-mail';

describe('emailsProblem', () => {
	const built = (emails: readonly string[]) => ({
		locales: ['en', 'fr'],
		emails: Object.fromEntries(emails.map((email) => [email, {}])),
	});

	test('holds for exactly the five e-mails, in any order', () => {
		expect(emailsProblem(built([...EXPECTED_EMAILS].reverse()))).toBeNull();
	});

	test('refuses an e-mail too many, one missing, or none', () => {
		expect(emailsProblem(built([...EXPECTED_EMAILS, 'welcome']))).toStartWith(
			'build-mail: the build holds email-changed, password-changed, reset-password, sign-in-code, verify-email, welcome, ',
		);
		expect(emailsProblem(built(EXPECTED_EMAILS.slice(1)))).not.toBeNull();
		expect(emailsProblem(built([]))).toStartWith(
			'build-mail: the build holds no e-mail, ',
		);
	});
});

describe('localesModule', () => {
	test('writes the locales as a const tuple and their union', () => {
		const source = localesModule(['en', 'fr']);
		expect(source).toContain("export const LOCALES = ['en', 'fr'] as const;");
		expect(source).toContain(
			'export type JanusMailLocale = (typeof LOCALES)[number];',
		);
		expect(source.endsWith('\n')).toBe(true);
	});
});
