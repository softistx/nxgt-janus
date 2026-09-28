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
3. `scripts/build-mail.ts` reads the manifest and **fails unless its
   format is one every `@nxgt/mail` the peer admits reads** — see below —
   and **unless exactly the eight e-mails were built**: a ninth from a new
   `@nxgt/mail-presets`, or one missing, stops the build.
4. It writes `src/generated/locales.ts` from the manifest's locales, only
   when its content changed.

Then `../../build.ts` builds `dist/`, as for every package.

## The manifest's format keeps the peer honest

The package peers `@nxgt/mail` at `>=0.1.0 <1`, so the build it ships must
be readable by `@nxgt/mail` 0.1.0 — the peer's floor, which the package's
specs and its typecheck run on in the Floors job, on every CI run. The
manifest says which format it is in — `formatVersion`, its first key,
`MANIFEST_FORMAT` of the `@nxgt/mail-i18n` that built it — and within 0.x a
renderer reads every format up to its own.
`@nxgt/mail` 0.1.0 through 0.9.0 read format 1, and a manifest without the
field is format 1.

`formatProblem` in `scripts/build-mail.ts` (spec'd beside it) fails the build
when:

| Message | Cause | Fix |
| --- | --- | --- |
| `build-mail: mails/mail-manifest.json is manifest format 2, where @nxgt/mail-i18n writes 1 — a mails/ left by another build; run the build again` | `mails/` is not what this `@nxgt/mail-i18n` wrote | Run `bun run build:mail` again |
| `build-mail: mails/mail-manifest.json is manifest format 2, and @nxgt/mail 0.1.0, the peer's floor, reads up to 1 — raise the @nxgt/mail peer's floor to the first version that reads it` | A new `@nxgt/mail-i18n` writes a format the floor cannot read | Raise the peer's floor, then `PEER_FLOOR_READS` with it |

`PEER_FLOOR_READS` is a constant, `1`, rather than `MANIFEST_FORMAT` from
`@nxgt/mail/renderer`: the devDependency is newer than the floor, and
`@nxgt/mail` 0.5.0 and earlier export no `MANIFEST_FORMAT`. The pattern is
`@nxgt/mail-i18n`'s
[Shipping a build in a package](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-i18n/docs/guide/manifest.md#shipping-a-build-in-a-package).

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

An override in a catalogue uses the presets' own key, in kebab-case since
`@nxgt/mail-presets` 0.3.0, and nested, never dotted — `presets.link-expires`
is written:

```json
{ "presets": { "link-expires": "…" } }
```

`@nxgt/mail-i18n` accepts a camelCase key too, so an override under a key from
before presets 0.3.0, such as `presets.linkExpires`, is a key of its own that
no preset reads. In both `en` and `fr`, it is ignored without an error, and
the preset's own text goes out instead. In one locale only, the build
refuses it — in `en` alone, as missing from
`fr`; in `fr` alone, as unknown to `en`:

```text
Error: i18n: fr: presets.linkExpires is missing — en, the fallback locale, has it
Error: i18n: fr: presets.linkExpires is not a key of en, the fallback locale
```

The presets'
[Upgrading](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-presets/docs/troubleshooting.md#upgrading)
entry lists every old and new key.

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
| `src/generated/` | yes | So the package type-checks without a Maizzle build. CI rebuilds it and runs `git diff --exit-code` on it: a stale copy fails. `generated/mail.ts`'s header says *never committed* — `@nxgt/mail-i18n`'s advice to an application; this package commits it on purpose |

## See also

- `@nxgt/mail-i18n`'s [manifest guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-i18n/docs/guide/manifest.md)
  — the manifest and `generated/mail.ts`.
- `@nxgt/mail-ui`'s [plugin guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-ui/docs/guide/plugin.md)
  — `ui({ brand, theme })`.
