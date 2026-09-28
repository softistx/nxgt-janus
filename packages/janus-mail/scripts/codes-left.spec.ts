import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	branchesOf,
	codesLeftMessage,
	codesLeftModule,
	messageOf,
} from './codes-left';

describe('branchesOf', () => {
	test("reads the preset's plural as text and the count's place", () => {
		expect(branchesOf('en', codesLeftMessage('en'))).toEqual({
			'=0': ['You have no recovery codes left.'],
			one: ['You have ', null, ' recovery code left.'],
			other: ['You have ', null, ' recovery codes left.'],
		});
	});

	const refused =
		"build-mail: xx's recovery-code-used.codes-left must be one plural on recoveryCodesLeft, with an other branch and no offset";

	for (const [shape, message] of [
		['plain text', 'You have some codes left.'],
		['text around the plural', 'Note: {recoveryCodesLeft, plural, other {#}}'],
		['a plural on another argument', '{count, plural, other {# left}}'],
		['an ordinal', '{recoveryCodesLeft, selectordinal, other {#th}}'],
		['an offset', '{recoveryCodesLeft, plural, offset:1 other {# left}}'],
	] as const) {
		test(`refuses ${shape}`, () => {
			expect(() => branchesOf('xx', message)).toThrow(refused);
		});
	}

	test('refuses an argument inside a branch', () => {
		expect(() =>
			branchesOf('xx', '{recoveryCodesLeft, plural, other {# for {name}}}'),
		).toThrow(
			"build-mail: xx's recovery-code-used.codes-left holds something other than text and # in a branch",
		);
	});
});

describe('messageOf', () => {
	const preset = { 'recovery-code-used': { 'codes-left': 'preset' } };

	test("takes the locale file's override over the preset's", () => {
		const override = { 'recovery-code-used': { 'codes-left': 'override' } };
		expect(messageOf('xx', override, preset)).toBe('override');
	});

	test("falls back to the preset's when the locale file has none", () => {
		expect(messageOf('xx', {}, preset)).toBe('preset');
		expect(
			messageOf('xx', { 'recovery-code-used': { subject: 'x' } }, preset),
		).toBe('preset');
	});

	test('reads the nested key, never a flat one', () => {
		const flat = { 'recovery-code-used.codes-left': 'flat' };
		expect(messageOf('xx', flat, preset)).toBe('preset');
	});

	test('refuses a locale with neither, naming it', () => {
		expect(() => messageOf('xx', {}, undefined)).toThrow(
			'build-mail: xx has no recovery-code-used.codes-left — add it to mail/locales/xx.json',
		);
	});
});

describe('codesLeftModule', () => {
	test('is what the build committed, for the locales built', () => {
		const built = codesLeftModule({
			en: branchesOf('en', codesLeftMessage('en')),
			fr: branchesOf('fr', codesLeftMessage('fr')),
		});
		const committed = readFileSync(
			fileURLToPath(new URL('../src/generated/codes-left.ts', import.meta.url)),
			'utf8',
		);
		expect(built).toBe(committed);
	});
});
