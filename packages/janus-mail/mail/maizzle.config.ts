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
 *   tints follow it, so the defaults carry no one's colours.
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

/** The five e-mails of Janus's flows. `scripts/build-mail.ts` refuses a build of any other set. */
const mails = presets({
	only: [
		'verify-email',
		'reset-password',
		'sign-in-code',
		'password-changed',
		'email-changed',
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
				theme: { 'color-primary': '#27272a' },
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
