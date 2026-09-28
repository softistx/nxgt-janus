import { describe, expect, test } from 'bun:test';
import { createTranslator } from '@nxgt/mail-i18n';
import { presetCatalogues } from '@nxgt/mail-presets';
import { codesLeftText } from './codes-left';
import { LOCALES } from './generated/locales';

// `@nxgt/mail-i18n` and `@nxgt/mail-presets` are build-only: a spec may read
// them, the package may not. `createTranslator` over the presets is the
// reference the send's formatting must equal.

describe('codesLeftText', () => {
	test('reads as the preset catalogue says, in en and fr', () => {
		expect(codesLeftText('en', 0)).toBe('You have no recovery codes left.');
		expect(codesLeftText('en', 1)).toBe('You have 1 recovery code left.');
		expect(codesLeftText('en', 9)).toBe('You have 9 recovery codes left.');
		expect(codesLeftText('fr', 0)).toBe(
			'Il ne vous reste aucun code de récupération.',
		);
		expect(codesLeftText('fr', 1)).toBe(
			'Il vous reste 1 code de récupération.',
		);
		expect(codesLeftText('fr', 2)).toBe(
			'Il vous reste 2 codes de récupération.',
		);
	});

	test("equals createTranslator's, for every count from 0 to 1,100 in every built locale", () => {
		for (const locale of LOCALES) {
			const t = createTranslator(presetCatalogues, locale);
			for (let count = 0; count <= 1_100; count += 1) {
				expect(codesLeftText(locale, count)).toBe(
					t('recovery-code-used.codes-left', { recoveryCodesLeft: count }),
				);
			}
		}
	});

	test('is undefined for a locale the default e-mails are not built in', () => {
		expect(codesLeftText('de', 3)).toBeUndefined();
	});
});
