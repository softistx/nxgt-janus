# @nxgt/janus-mail

## 0.3.1

### Patch Changes

- [#127](https://github.com/softistx/nxgt-janus/pull/127) [`bb91c57`](https://github.com/softistx/nxgt-janus/commit/bb91c573a4e32cd442e257c1c9c374e20adfb8e3) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The button now shows in dark mode. Until now it kept its near-black colour on the dark card, where it all but vanished (1.2:1). Under dark mode it is now near-white (`#fafafa`, 17:1 against the card) with near-black text (`#18181b`), in every client that follows dark mode; Gmail still shows the light e-mail. The page behind the card follows the new colour and sits a shade lighter, close to the card, which its border outlines. The e-mails are rebuilt with `@nxgt/mail-ui` 0.5.0, `@nxgt/mail-presets` 0.4.1 and `@nxgt/mail-i18n` 0.6.0. Light mode, the text parts, the subjects, the variables, the manifest (format 1) and the JavaScript are unchanged. The `@nxgt/mail` peer stays `>=0.1.0 <1`. An override that returns its own `html` is not affected.

## 0.3.0

### Minor Changes

- [#125](https://github.com/softistx/nxgt-janus/pull/125) [`f02c2f3`](https://github.com/softistx/nxgt-janus/commit/f02c2f387628bcd9d5c5ec30b8501c61c8c1f5a0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Two new notices: `mail.twoFactorEnabled(to)` and `mail.twoFactorDisabled(to)`. They tell `to.email` that two-factor authentication was turned on or off, and link to `links.secureAccount()`, the page where the user manages their security settings. They are built in English and French from `@nxgt/mail-presets` 0.4.0's `two-factor-enabled` and `two-factor-disabled`. Send them on `@nxgt/janus`'s new `user.secondFactorEnabled` and `user.secondFactorDisabled` events:
  
  ```ts
  if (event.type === 'user.secondFactorDisabled') {
  	const user = await auth.get(event.userId);
  	await mail.twoFactorDisabled({ name: user.name, locale: user.locale, email: user.email });
  }
  ```
  
  `janusTemplates()`, `JanusMailTemplates` and `JanusMailVariables` gain the two templates. **With a locale beyond `en` and `fr`, `templates` must now include `twoFactorEnabled` and `twoFactorDisabled` too.** Until it does, the call does not compile, and in JavaScript `janusMail()` throws a `TypeError` that lists the missing templates.

### Patch Changes

- [#122](https://github.com/softistx/nxgt-janus/pull/122) [`4d48a34`](https://github.com/softistx/nxgt-janus/commit/4d48a348d82d80cc0a3e20083a3110fd2f398d54) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The e-mails now follow the reader's dark mode. They are rebuilt with `@nxgt/mail-ui` 0.4.0, `@nxgt/mail-presets` 0.4.0 and `@nxgt/mail-i18n` 0.5.0, and each HTML part declares `color-scheme: light dark`. A mail client that reads `prefers-color-scheme`, or Outlook's `[data-ogsc]`, shows a dark page, a dark card and light text when the reader is in dark mode. Gmail always shows the light e-mail, as before. The text parts, the subjects, the variables and the manifest (format 1) are unchanged, and so is the JavaScript. The `@nxgt/mail` peer stays `>=0.1.0 <1`. An override that returns its own `html` is not affected.
- Updated dependencies [[`0be654f`](https://github.com/softistx/nxgt-janus/commit/0be654f2fb2d02186cf68cab070d59b8b039d129)]:
  - @nxgt/janus@0.9.0

## 0.2.1

### Patch Changes

- [#102](https://github.com/softistx/nxgt-janus/pull/102) [`174478e`](https://github.com/softistx/nxgt-janus/commit/174478e444b5471810910e0db988e21b78899693) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `TypeError` for a locale that `Intl` rejects now reads `janusMail: locales must be BCP 47 language tags, as 'fr-CA'`. The words "with hyphens" are gone: they misled for `i-klingon` or `x-foo`, which already hold hyphens and are refused anyway. The check itself is unchanged. Code that matches the old message text must match the new one.

- [#104](https://github.com/softistx/nxgt-janus/pull/104) [`26d0b69`](https://github.com/softistx/nxgt-janus/commit/26d0b69cae5d66ab0eb8367a5b153a26bdac4878) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The e-mails are now built with `@nxgt/mail-i18n` 0.4.0, `@nxgt/mail-ui` 0.3.0 and `@nxgt/mail-presets` 0.3.0, whose message keys moved to kebab-case. The package names no key, so the built `mails/` is byte for byte the same as before: the e-mails, their subjects, their variables and the manifest (format 1) are unchanged. The `@nxgt/mail` peer is unchanged.

## 0.2.0

### Minor Changes

- [#100](https://github.com/softistx/nxgt-janus/pull/100) [`3d5e5b7`](https://github.com/softistx/nxgt-janus/commit/3d5e5b7b71b3e8997136537c2004781630ba5df6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The verification, password-reset and sign-in code e-mails now say how long the link or code lasts: "This link expires in 1 hour.", "Ce lien expire dans 1 heure." The text is derived from the flow's `expiresAt` at send time, in the recipient's locale. The time left is rounded to the minute, then down to the largest whole unit (days, hours or minutes), and formatted with `Intl.NumberFormat`. To give your own wording, pass it as a third argument: `mail.verifyEmail(issued, to, { expiresIn: '24 heures' })`.
  
  - **Breaking.** There are two breaks:
    - `JanusMailVariables` gains `expiresIn` for `verifyEmail`, `resetPassword` and `signInCode`. Code that calls a template directly must now pass it, for example `janusTemplates().resetPassword({ …, expiresIn: '1 heure', locale })` or `mail.templates.verifyEmail({ …, expiresIn, locale })`. An override is given `expiresIn` and may ignore it.
    - `signInCode` now reads `issued.expiresAt`. An argument built by hand, such as `{ code, email }`, must add `expiresAt`. Passing the flow's answer whole still compiles.
  - **New errors.** A send whose `expiresAt` is not a valid `Date` (for example, a flow's answer that went through JSON) or is already in the past is a `TypeError`, and nothing is sent. So is a `clock` whose `now()` does not return a `Date`. `janusMail()` now also refuses, with a `TypeError`, any locale in `locales` that `Intl` rejects, such as `de_DE`. Write it as `de-DE`.
  - **Rebuilt e-mails.** The defaults are rebuilt with `@nxgt/mail-presets` 0.2.0, `@nxgt/mail-config` 0.2.1, `@nxgt/mail-ui` 0.2.0 and `@nxgt/mail-i18n` 0.3.1. The text parts no longer break a sentence across lines. The `@nxgt/mail` peer stays `>=0.1.0 <1`.
  - **New option.** `janusMail({ clock })` sets the clock the time left is measured against. Pass it the clock you gave `janus({ clock })`, such as a `fixedClock` in tests. It defaults to the system clock. Tests that give `janus()` a clock set in the past need it here too.
  - **New export.** `JanusMailSendOptions` is now exported.

## 0.1.0

### Minor Changes

- [#97](https://github.com/softistx/nxgt-janus/pull/97) [`9f196da`](https://github.com/softistx/nxgt-janus/commit/9f196da2edcd9231fdc3a21a5f928fa085bf5ab4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: the e-mails of `@nxgt/janus`'s flows — e-mail verification, password reset, sign-in code, and the notices *password changed* and *e-mail changed* — in English and French, sent through any `@nxgt/mail` transport. `janusMail({ mailer, from, brand, links })` takes what each flow answers, as it answers it; `janusTemplates()` answers the five default templates, without a mailer. The e-mails are built with Maizzle when this package is built and shipped in `mails/`, so your server only fills them in — your brand, the recipient's name, your links, every value escaped — with no template engine. Any one of them can be your own function, and a send rejects with the mailer's own `MailFailure` or `MailRefused`. Peers: `@nxgt/mail` 0.1 or later below 1, `@nxgt/janus` 0.8, and `typescript` 6. Keep the package external to your server bundle, so `mails/` is deployed with it.

### Patch Changes

- Updated dependencies [[`9f196da`](https://github.com/softistx/nxgt-janus/commit/9f196da2edcd9231fdc3a21a5f928fa085bf5ab4)]:
  - @nxgt/janus@0.8.8
