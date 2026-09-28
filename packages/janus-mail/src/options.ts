/**
 * `janusMail()`'s options, checked once when it is called. A mistake is a
 * wiring mistake, so a bare `TypeError` naming the option — never its value —
 * thrown before anything is sent.
 */
import type { Clock } from '@nxgt/janus';
import type { Address, Mailer } from '@nxgt/mail';
import { LOCALES } from './generated/locales';
import { checkLinks, frozenLinks } from './links';
import { janusTemplates } from './templates';
import type {
	JanusMailLinks,
	JanusMailTemplateName,
	JanusMailTemplates,
} from './types';

/** The templates in the order the documentation lists them. */
export const TEMPLATE_NAMES: readonly JanusMailTemplateName[] = [
	'verifyEmail',
	'resetPassword',
	'signInCode',
	'passwordChanged',
	'emailChanged',
	'twoFactorEnabled',
	'twoFactorDisabled',
	'recoveryCodeUsed',
	'welcome',
];

/** The options once checked, with `string` for the locales: the degenericised mirror. */
export interface ResolvedOptions {
	readonly mailer: Mailer;
	readonly from: Address;
	readonly replyTo: Address | undefined;
	readonly brand: string;
	readonly links: JanusMailLinks;
	readonly locales: readonly string[];
	readonly fallbackLocale: string;
	readonly templates: JanusMailTemplates<string>;
	readonly clock: Clock;
}

/** The system clock, written here: `@nxgt/janus` is a peer for its types only. */
const SYSTEM_CLOCK: Clock = Object.freeze({ now: () => new Date() });

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAddress(value: unknown): value is Address {
	if (typeof value === 'string') return value.trim() !== '';
	return (
		isObject(value) &&
		typeof value.name === 'string' &&
		typeof value.address === 'string' &&
		value.address.trim() !== ''
	);
}

function refuse(message: string): never {
	throw new TypeError(`janusMail: ${message}`);
}

/** `mailer`, `from`, `replyTo`, `brand` and `links` (`./links`). */
function checkSending(options: Record<string, unknown>): void {
	const { mailer, from, replyTo, brand, links } = options;
	if (!isObject(mailer) || typeof mailer.send !== 'function') {
		refuse('mailer must be a Mailer — an object with a send function');
	}
	if (!isAddress(from)) {
		refuse(
			"from must be an address, as 'noreply@example.com' or { name, address }",
		);
	}
	if (replyTo !== undefined && !isAddress(replyTo)) {
		refuse(
			"replyTo must be an address, as 'support@example.com' or { name, address }",
		);
	}
	if (typeof brand !== 'string' || brand.trim() === '') {
		refuse("brand must be the name the e-mails show, as 'Acme'");
	}
	checkLinks(links);
}

/** `clock`, bound to the caller's object, or the system clock. */
function resolveClock(clock: unknown): Clock {
	if (clock === undefined) return SYSTEM_CLOCK;
	if (!isObject(clock) || typeof clock.now !== 'function') {
		refuse('clock must be a Clock — an object with a now function');
	}
	return Object.freeze({ now: (clock.now as () => Date).bind(clock) });
}

/** Whether `Intl` takes the locale — the expiry is formatted in it — as `fr-CA`, not `fr_CA`. */
function isLanguageTag(locale: string): boolean {
	try {
		Intl.getCanonicalLocales(locale);
		return true;
	} catch {
		return false;
	}
}

/** `locales` and `fallbackLocale`, with their defaults. */
function resolveLocales(options: Record<string, unknown>): {
	locales: readonly string[];
	fallbackLocale: string;
} {
	const wanted = options.locales ?? LOCALES;
	if (
		!Array.isArray(wanted) ||
		wanted.length === 0 ||
		!wanted.every((locale) => typeof locale === 'string' && locale !== '')
	) {
		refuse("locales must list at least one locale, as ['en', 'fr']");
	}
	const locales: readonly string[] = Object.freeze([...wanted]);
	if (!locales.every(isLanguageTag)) {
		refuse("locales must be BCP 47 language tags, as 'fr-CA'");
	}
	if (new Set(locales).size !== locales.length) {
		refuse('locales holds the same locale twice');
	}
	const fallbackLocale =
		options.fallbackLocale ??
		(locales.includes('en') ? 'en' : (locales[0] as string));
	if (typeof fallbackLocale !== 'string' || !locales.includes(fallbackLocale)) {
		refuse('fallbackLocale must be one of locales');
	}
	return { locales, fallbackLocale };
}

/** `templates` over the defaults — the defaults only while every locale is built. */
function resolveTemplates(
	options: Record<string, unknown>,
	locales: readonly string[],
): JanusMailTemplates<string> {
	const given = options.templates ?? {};
	if (!isObject(given)) {
		refuse(
			'templates must be an object of functions, as { verifyEmail: (variables) => rendered }',
		);
	}
	for (const [name, template] of Object.entries(given)) {
		if (!(TEMPLATE_NAMES as readonly string[]).includes(name)) {
			refuse(
				`templates has no template ${name} — name one of ${TEMPLATE_NAMES.join(', ')}`,
			);
		}
		if (typeof template !== 'function') {
			refuse(`templates.${name} must be a function`);
		}
	}
	// Own enumerable keys, the ones the spread below copies. A template on a
	// prototype — a class instance's method — or an own property that is not
	// enumerable would be dropped without a word, the default sent in its
	// place: `in` sees it and `passed` does not, so it is refused instead.
	const passed = Object.keys(given);
	for (const name of TEMPLATE_NAMES) {
		if (name in given && !passed.includes(name)) {
			refuse(
				`templates.${name} is not an own enumerable property — pass a plain object, as { ${name}: (variables) => rendered }`,
			);
		}
	}
	const built = locales.every((locale) =>
		(LOCALES as readonly string[]).includes(locale),
	);
	const missing = TEMPLATE_NAMES.filter((name) => !passed.includes(name));
	if (!built && missing.length > 0) {
		refuse(
			`the default templates are built in ${LOCALES.join(' and ')} only — with another ` +
				`locale in locales, pass every template in templates; ${missing.join(', ')} missing`,
		);
	}
	// The one cast: a default template takes a built locale only, and the check
	// above proves every locale is one whenever a default is kept.
	const defaults = janusTemplates() as unknown as JanusMailTemplates<string>;
	return Object.freeze({ ...defaults, ...given }) as JanusMailTemplates<string>;
}

/** A frozen copy of a checked address: a later change to the caller's object is not seen. */
function frozenAddress(address: Address): Address {
	return typeof address === 'string'
		? address
		: Object.freeze({ name: address.name, address: address.address });
}

/**
 * Checks `janusMail()`'s options and answers them resolved, or throws a
 * `TypeError`. What was checked is copied and frozen, so the guarantee made
 * here holds at every send.
 */
export function resolveOptions(options: unknown): ResolvedOptions {
	if (!isObject(options)) {
		refuse('options must be an object, as { mailer, from, brand, links }');
	}
	checkSending(options);
	const { locales, fallbackLocale } = resolveLocales(options);
	return Object.freeze({
		mailer: options.mailer as Mailer,
		from: frozenAddress(options.from as Address),
		replyTo:
			options.replyTo === undefined
				? undefined
				: frozenAddress(options.replyTo as Address),
		brand: options.brand as string,
		links: frozenLinks(options.links as unknown as JanusMailLinks),
		locales,
		fallbackLocale,
		templates: resolveTemplates(options, locales),
		clock: resolveClock(options.clock),
	});
}
