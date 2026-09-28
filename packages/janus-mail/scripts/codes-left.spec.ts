import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { branchesOf, codesLeftMessage, codesLeftModule } from './codes-left';

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
