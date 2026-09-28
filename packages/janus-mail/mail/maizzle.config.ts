/**
 * The Maizzle project that builds `@nxgt/janus-mail`'s default e-mails. It runs
 * at **our** build, never in a consumer's: `scripts/build-mail.ts` runs
 * `maizzle build` here, and the package ships what it wrote in `../mails/`.
 *
 * Three choices hold the package together:
 *
 * - **The brand is a placeholder.** `ui({ brand: { name: '{{ brand }}' } })`
 *   writes `{{ brand }}` wherever `<NxLayout>` and the presets show the brand's
 *   name, so the manifest lists `brand` among each e-mail's variables and the
 *   renderer fills it at send time, with the name `janusMail({ brand })` was
 *   given. No `url` and no `logo`: both must be absolute URLs known at build
 *   time, which the package cannot know.
 * - **A neutral theme.** The primary colour is a near-black grey, and the
 *   tints follow it, so the defaults carry no one's colours. Under dark mode
 *   the button inverts to near-white with near-black text: `#27272a` on the
 *   dark card (`#0f172b`) is 1.2:1 and all but vanishes; `#fafafa` is 17.1:1
 *   against it, and `#18181b` on `#fafafa` 17.0:1. Muted is a pair, since
 *   `@nxgt/mail-ui` 0.7.0 flips muted text in dark mode wherever its ground
 *   flips: the sign-in code (`NxCode`) and the muted text, on the muted box,
 *   the dark card or the dark page, follow `color-muted-foreground-dark`,
 *   while a notice's alert keeps its light ground and its light text. The box
 *   turns a step above the dark card, `#1e293b`, with the code in `#cbd5e1` on
 *   it at 9.85:1; the muted text reads that slate at 12.01:1 on the card and
 *   13.31:1 on the page. A mid-slate box would need dark text there, and the
 *   card and page light text, which no one `color-muted-foreground-dark` gives
 *   all three. The light
 *   muted text is `#5f718a`, a shade under `@nxgt/mail-ui`'s `#62748e`, which
 *   read at 4.33:1 on the page and 4.36:1 on the error alert: 4.53:1 and
 *   4.56:1 now, so every muted text is at 4.5:1 or more in both modes.
 * - **The locales are the catalogues.** Each `locales/<locale>.json` is a
 *   locale built; the presets are written in `en` and `fr`, and a locale
 *   without their messages fails the build.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MaizzleConfig } from '@maizzle/framework';
import { defineMailConfig, productionConfig } from '@nxgt/mail-config';
import { i18n } from '@nxgt/mail-i18n';
import { presets } from '@nxgt/mail-presets';
import { ui, uiCatalogues } from '@nxgt/mail-ui';

/** The eight e-mails of Janus's flows. `scripts/build-mail.ts` refuses a build of any other set. */
const mails = presets({
	only: [
		'verify-email',
		'reset-password',
		'sign-in-code',
		'password-changed',
		'email-changed',
		'two-factor-enabled',
		'two-factor-disabled',
		'welcome',
	],
});

/** `en` first: it is the fallback locale, the catalogue every other one is checked against. */
const locales = readdirSync(
	fileURLToPath(new URL('./locales/', import.meta.url)),
)
	.filter((file) => file.endsWith('.json'))
	.map((file) => file.slice(0, -'.json'.length))
	.sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));

const config: MaizzleConfig = productionConfig(
	defineMailConfig({
		plugins: [
			ui({
				brand: { name: '{{ brand }}' },
				theme: {
					'color-primary': '#27272a',
					'color-primary-dark': '#fafafa',
					'color-primary-foreground-dark': '#18181b',
					'color-muted-foreground': '#5f718a',
					'color-muted-dark': '#1e293b',
					'color-muted-foreground-dark': '#cbd5e1',
				},
			}),
			i18n({
				locales,
				fallbackLocale: 'en',
				catalogues: [uiCatalogues, mails.catalogues],
				templates: [mails.templates],
				rendererTypes: '../src/generated/mail.ts',
			}),
		],
		output: { path: '../mails' },
	}),
);

export default config;
