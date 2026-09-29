/**
 * What `newSignIn` shows where the sender knew no location — "Unknown",
 * "Inconnu" — in the recipient's locale: the value after the row's label,
 * so "Location Unknown", "Lieu Inconnu".
 *
 * A map written here, not a message in `mail/locales/*.json`: those
 * catalogues are read by the Maizzle build alone, and hold only the
 * presets' own keys, which the build checks against `@nxgt/mail-presets`'
 * `en`. This string is a send's — whether a location was given is known
 * only then — so it is chosen at send time, as the codes left are
 * (`./codes-left`). Keyed by `JanusMailLocale`, so a locale added to the
 * build without its text here is a compile error.
 */
import type { JanusMailLocale } from './generated/locales';

/** The text of a missing location, by built locale. */
export const NO_LOCATION: Readonly<Record<JanusMailLocale, string>> =
	Object.freeze({
		en: 'Unknown',
		fr: 'Inconnu',
	});

function isBuilt(locale: string): locale is JanusMailLocale {
	return Object.hasOwn(NO_LOCATION, locale);
}

/**
 * The text of a missing location in `locale` — the one `localeFor` picked —
 * else in its language (`fr` for `fr-CA`), else in `en`: a locale beyond
 * the built ones is sent only through templates of the consumer's own.
 */
export function noLocationText(locale: string): string {
	if (isBuilt(locale)) return NO_LOCATION[locale];
	// A language tag: `resolveOptions` refused anything else in `locales`.
	const { language } = new Intl.Locale(locale);
	return isBuilt(language) ? NO_LOCATION[language] : NO_LOCATION.en;
}
