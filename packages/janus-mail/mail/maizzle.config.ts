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
 *   against it, and `#18181b` on `#fafafa` 17.0:1. The sign-in code's box
 *   (`NxCode`, on muted) turns a mid slate, `#94a3b8`, rather than staying a
 *   light slab: its text is pinned to the light foreground (`#020918`) in both
 *   modes, 7.76:1 on it, and the box is 6.95:1 against the dark card. A dark
 *   muted such as `#1e293b` would leave that text at 1.36:1.
 *   `color-muted-foreground-dark` stays unset: muted text sits both on the
 *   dark page and on the notices' warning box, which keeps its light ground,
 *   and the light value (`#62748e`, 4.15:1 and 4.46:1) is already near the
 *   best one colour can do on both.
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
					'color-muted-dark': '#94a3b8',
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
