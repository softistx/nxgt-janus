/**
 * The sentence of the recovery codes left, in the recipient's locale:
 * "You have 1 recovery code left." — the `recovery-code-used` e-mail's
 * `recoveryCodesLeft`, which the build could not write since the count is a
 * send's.
 *
 * Formatted from `src/generated/codes-left.ts`, the preset's ICU plural
 * parsed at our build, as `@nxgt/mail-i18n`'s `createTranslator` formats
 * it: an exact branch (`=0`) first, then the locale's plural category, then
 * `other`, with `#` as the count in the locale's digits. No Maizzle and no
 * ICU parser at send time.
 */
import { CODES_LEFT } from './generated/codes-left';

/**
 * The sentence for `count` codes left in `locale`, or `undefined` for a
 * locale the default e-mails are not built in.
 */
export function codesLeftText(
	locale: string,
	count: number,
): string | undefined {
	const branches = CODES_LEFT[locale];
	if (branches === undefined) return undefined;
	const branch =
		branches[`=${count}`] ??
		branches[new Intl.PluralRules(locale).select(count)] ??
		branches.other;
	const digits = new Intl.NumberFormat(locale).format(count);
	return (branch ?? []).map((part) => part ?? digits).join('');
}
