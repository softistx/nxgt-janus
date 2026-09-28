import { describe, expect, test } from 'bun:test';
import {
	EXPECTED_EMAILS,
	emailsProblem,
	formatProblem,
	localesModule,
	PEER_FLOOR_READS,
} from './build-mail';

describe('emailsProblem', () => {
	const built = (emails: readonly string[]) => ({
		locales: ['en', 'fr'],
		emails: Object.fromEntries(emails.map((email) => [email, {}])),
	});

	test('holds for exactly the nine e-mails, in any order', () => {
		expect(emailsProblem(built([...EXPECTED_EMAILS].reverse()))).toBeNull();
	});

	test('refuses an e-mail too many, one missing, or none', () => {
		expect(
			emailsProblem(built([...EXPECTED_EMAILS, 'magic-link'])),
		).toStartWith(
			'build-mail: the build holds email-changed, magic-link, password-changed, recovery-code-used, reset-password, sign-in-code, two-factor-disabled, two-factor-enabled, verify-email, welcome, ',
		);
		expect(emailsProblem(built(EXPECTED_EMAILS.slice(1)))).not.toBeNull();
		expect(emailsProblem(built([]))).toStartWith(
			'build-mail: the build holds no e-mail, ',
		);
	});
});

describe('formatProblem', () => {
	const built = (formatVersion?: unknown) => ({
		...(formatVersion === undefined ? {} : { formatVersion }),
		locales: ['en', 'fr'],
		emails: {},
	});

	test('holds for the format @nxgt/mail-i18n writes, when the peer floor reads it', () => {
		expect(formatProblem(built(1), 1)).toBeNull();
	});

	test("reads format 1 as all @nxgt/mail 0.1.0, the peer's floor, reads", () => {
		expect(PEER_FLOOR_READS).toBe(1);
	});

	test('refuses a manifest of another format than the one written: a mails/ left by another build', () => {
		expect(formatProblem(built(2), 1)).toBe(
			'build-mail: mails/mail-manifest.json is manifest format 2, where @nxgt/mail-i18n writes 1 — a mails/ left by another build; run the build again',
		);
		expect(formatProblem(built(), 1)).toStartWith(
			'build-mail: mails/mail-manifest.json is manifest format undefined, ',
		);
		expect(formatProblem(built('1'), 1)).not.toBeNull();
	});

	test("refuses a format newer than the peer's floor reads", () => {
		expect(formatProblem(built(2), 2)).toBe(
			"build-mail: mails/mail-manifest.json is manifest format 2, and @nxgt/mail 0.1.0, the peer's floor, reads up to 1 — raise the @nxgt/mail peer's floor to the first version that reads it",
		);
		expect(formatProblem(built(2), 2, 2)).toBeNull();
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
