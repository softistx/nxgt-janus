# Building

This page is for working on the package itself: how the default e-mails are
built, what is committed and what is shipped, and why a consumer needs none
of it. An application that uses `@nxgt/janus-mail` never runs this build.

```sh
cd packages/janus-mail
bun run build        # build:mail, then the TypeScript build
bun run build:mail   # the e-mails alone
```

## Maizzle runs at our build, never at the consumer's

The e-mails are compiled once, when this package is built: Maizzle, Vue,
Tailwind CSS and the `@nxgt/mail-*` build packages are **devDependencies**.
The tarball carries their output — HTML and text per locale, and a manifest —
and at send time `@nxgt/mail/renderer` fills its placeholders. A consumer
installs `@nxgt/mail` and nothing that builds.

```text
packages/janus-mail/
  mail/                    the Maizzle project — not shipped
    maizzle.config.ts      presets({ only: the 5 }), ui(), i18n()
    locales/en.json        {} — the presets' messages, unchanged
    locales/fr.json
  mails/                   what the build wrote — shipped, never committed
    mail-manifest.json
    en/verify-email.html   en/verify-email.txt   …
    fr/verify-email.html   fr/verify-email.txt   …
  scripts/build-mail.ts    runs maizzle build, checks the manifest, writes locales.ts
  src/generated/           written by the build — committed
    mail.ts                MailEmails: each e-mail and its variables
    locales.ts             LOCALES and JanusMailLocale
```

## What `build:mail` does

1. `maizzle build` in `mail/`, with `productionConfig`: minified HTML, a
   text part for each e-mail, written to `../mails/`. Maizzle empties the
   folder first, so an e-mail removed leaves no file behind.
2. `@nxgt/mail-i18n` writes `mails/mail-manifest.json` and
   `src/generated/mail.ts` (`rendererTypes`), from the build.
3. `scripts/build-mail.ts` reads the manifest and **fails unless exactly
   the five e-mails were built** — a sixth from a new `@nxgt/mail-presets`,
   or one missing, stops the build.
4. It writes `src/generated/locales.ts` from the manifest's locales, only
   when its content changed.

Then `../../build.ts` builds `dist/`, as for every package.

## The brand is a placeholder

`maizzle.config.ts` gives `ui()` the brand `{ name: '{{ brand }}' }`. Every
place `@nxgt/mail-ui`'s layout and the presets write the brand's name — the
header, the body, the footer — holds the placeholder `{{ brand }}`, so the
manifest lists `brand` among each e-mail's variables, and the renderer
requires it and escapes it like any other value. That is why the brand is
text only: a URL or a logo must be absolute when `ui()` is called.

The build's check is the renderer's own: a variable left out of `render`
throws, so no e-mail can go out with `{{ brand }}` in it. The specs render
each e-mail in both locales and search every part for `{{`.

## The locales are the catalogues

`locales` is read from `mail/locales/*.json`, `en` first — the fallback
locale every other catalogue is checked against. The catalogues are `{}`:
the presets' messages are used as they are. A new file adds a locale, and
the build fails until it holds every message the presets use in `en` (see
`@nxgt/mail-presets`'
[Another locale](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-presets/docs/guide/presets.md#another-locale)).

## Why `mails/` is not in `dist/`

The root `build.ts` removes from `dist/` every file it did not write itself,
so a module moved or deleted never ships. The built e-mails would be removed
on every TypeScript build. They live beside it, in `mails/`, listed in
`files`, and ignored by the package's `.gitignore`.

`src/mails.ts` resolves the folder from its own URL,
`new URL('../mails/', import.meta.url)`, which is right from `src/` in the
specs and from `dist/index.js` in the tarball — because the module sits
directly under `src/` and the package has one entry point. A second entry
point would move it into `dist/chunks/`, one level deeper: the artifact spec
renders from `../dist` and would fail.

`scripts/verify-artifacts.ts` checks that every `files` entry is in the
packed tarball, so a `mails/` that was not built, or that a packer left out,
fails before a release.

## What is committed

| Path | Committed | Why |
| --- | --- | --- |
| `mail/` | yes | The source of the build |
| `mails/` | no | Rebuilt by every build; shipped in the tarball |
| `mail/.maizzle/` | no | Maizzle's own generated files |
| `src/generated/` | yes | So the package type-checks without a Maizzle build. CI rebuilds it and runs `git diff --exit-code` on it: a stale copy fails |

## See also

- `@nxgt/mail-i18n`'s [manifest guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-i18n/docs/guide/manifest.md)
  — the manifest and `generated/mail.ts`.
- `@nxgt/mail-ui`'s [plugin guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-ui/docs/guide/plugin.md)
  — `ui({ brand, theme })`.
