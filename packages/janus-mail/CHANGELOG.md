# @nxgt/janus-mail

## 0.5.2

### Patch Changes

- Updated dependencies [[`fac44ba`](https://github.com/softistx/nxgt-janus/commit/fac44baa935d90c451d05b942c8158606da2f1b2)]:
  - @nxgt/janus@0.13.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199)]:
  - @nxgt/janus@0.12.0

## 0.5.0

### Minor Changes

- [#154](https://github.com/softistx/nxgt-janus/pull/154) [`f29fd6e`](https://github.com/softistx/nxgt-janus/commit/f29fd6eb970ec1fd05de1b1cb86a9210d0e894a6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New e-mail: `mail.recoveryCodeUsed(to, { when, recoveryCodesLeft })`. It tells `to.email` that one of their recovery codes was used to sign in without their phone, says when, and says how many codes are left. It is built in English and French from `@nxgt/mail-presets` 1.0.0's `recovery-code-used`. Send it on `@nxgt/janus`'s `user.recoveryCodeUsed` event. That event carries only the user's id, so read the count with `auth.secondFactor.recoveryCodesLeft(user)` (new in `@nxgt/janus` 0.11):
  
  ```ts
  if (event.type === 'user.recoveryCodeUsed') {
  	const user = await auth.get(event.userId);
  	const recoveryCodesLeft = await auth.secondFactor.recoveryCodesLeft(user);
  	if (recoveryCodesLeft === null) return; // the factor was turned off since
  	const when = new Intl.DateTimeFormat(user.locale, { dateStyle: 'long', timeStyle: 'short', timeZone }).format(event.occurredAt);
  	await mail.recoveryCodeUsed({ name: user.name, locale: user.locale, email: user.email }, { when, recoveryCodesLeft });
  }
  ```
  
  - `when` is text. Format it in the recipient's locale and time zone.
  - `recoveryCodesLeft` is either a count or a sentence. A count is written with the preset's plural in the recipient's locale: "You have 1 recovery code left.", "Il ne vous reste aucun code de récupération.". The plural is parsed when this package is built, so no Maizzle and no ICU parser run in your server. A string is sent as is. For a locale beyond `en` and `fr`, pass the sentence: a count there is a `TypeError`.
  - The button links to the new `links.recoveryCodes()`, the page where the user regenerates their codes. The link is optional. Without it, the e-mail links to `links.secureAccount()`, so a `links` written for 0.4 still compiles and runs.
  
  `janusTemplates()`, `JanusMailTemplates` and `JanusMailVariables` gain the `recoveryCodeUsed` template, whose variables are `brand`, `name`, `when`, `recoveryCodesLeft` (a sentence) and `link`. **With a locale beyond `en` and `fr`, `templates` must now include `recoveryCodeUsed` too.** Until it does, the call does not compile, and in JavaScript `janusMail()` throws a `TypeError` that lists the missing templates.
  
  The link under the button is now readable in both modes. The e-mails are built with `@nxgt/mail-ui` 1.0.0, whose info blue has a dark value (`color-info-dark`), so each mode gets its own blue. On the light card it is `#1d4ed8`, 6.70:1 (it was `#54a2ff`, 2.63:1). On the dark card it is `#93c5fd`, 9.89:1 (it was 6.78:1). Every text of the default e-mails now reads at 4.5:1 or more in both modes. An override that returns its own `html` is not affected.
  
  The `@nxgt/mail` peer widens to `>=0.1.0 <2`, so `@nxgt/mail` 1.0 and its transports are accepted. The floor is still 0.1.0 and is still tested. The manifest is still format 1. The e-mails are rebuilt with `@nxgt/mail-config`, `@nxgt/mail-i18n`, `@nxgt/mail-ui` and `@nxgt/mail-presets` 1.0.1. Apart from the link's colours, the eight existing e-mails' text parts, subjects and variables are unchanged. Five new compile-time refusals bring the count to 34.

### Patch Changes

- Updated dependencies [[`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73)]:
  - @nxgt/janus@0.11.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`af8bf10`](https://github.com/softistx/nxgt-janus/commit/af8bf104d671f17a843d672ae86ae9ddad2559fb), [`7a419b9`](https://github.com/softistx/nxgt-janus/commit/7a419b9989de593b354dbf1ffdf6791202be6c0b), [`0789c39`](https://github.com/softistx/nxgt-janus/commit/0789c39bcc86f0b14738032020254b2d9465da0f), [`c9bcfe0`](https://github.com/softistx/nxgt-janus/commit/c9bcfe0ff6eff1347f6116a773be2df9d3893fa6)]:
  - @nxgt/janus@0.10.0

## 0.4.1

### Patch Changes

- [#144](https://github.com/softistx/nxgt-janus/pull/144) [`be48136`](https://github.com/softistx/nxgt-janus/commit/be48136e8c2bd055cc3c8179aee09597ed22f106) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Every muted text in the e-mails now reads at 4.5:1 or more, in both modes. In dark mode the sign-in code's box is a slate a step above the dark card (`#1e293b`) with light code on it (`#cbd5e1`, 9.85:1), where it was a mid slate with near-black code. The footer turns the same light slate, 13.31:1 on the dark page, where it kept its light grey at 4.15:1; the closing "if you did not ask for this" turns it too, 12.01:1 on the dark card, a step below the body text rather than as bright. In light mode the muted grey is a shade darker, `#5f718a` for `#62748e`: 4.53:1 on the page and 4.56:1 on the error notice's alert (4.67:1 on the warning's), from 4.33:1 and 4.36:1. The e-mails are rebuilt with `@nxgt/mail-ui` 0.7.0, whose `NxCode` text follows `color-muted-foreground-dark`, and `@nxgt/mail-presets` 0.4.3. Gmail still shows the light e-mail. The text parts, the subjects, the variables, the manifest (format 1) and the JavaScript are unchanged. The `@nxgt/mail` peer stays `>=0.1.0 <1`. An override that returns its own `html` is not affected.

## 0.4.0

### Minor Changes

- [#135](https://github.com/softistx/nxgt-janus/pull/135) [`1d9040b`](https://github.com/softistx/nxgt-janus/commit/1d9040b0fa8fd5dda18ff2e3b002eb8e0a66f93e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A new e-mail: `mail.welcome(to)`. It welcomes `to.email` by name ("Welcome, Ada" / "Bienvenue, Ada"), and its **Get started** button links to the new `links.getStarted()`, the page where a new user starts: your home page, or your sign-in page for an account someone else created. It is built in English and French from `@nxgt/mail-presets` 0.4.2's `welcome`. Send it on `@nxgt/janus`'s `user.created` event, which `auth.signUp` and `auth.create` send once the user is inserted:
  
  ```ts
  if (event.type === 'user.created') {
  	const user = await auth.get(event.userId);
  	await mail.welcome({ name: user.name, locale: user.locale, email: user.email });
  }
  ```
  
  **`links` must now include `getStarted`.** Until it does, the `janusMail()` call does not compile, and in JavaScript `janusMail()` throws `TypeError: janusMail: links.getStarted must be a function`. Add it even if you never send the welcome.
  
  `janusTemplates()`, `JanusMailTemplates` and `JanusMailVariables` gain the `welcome` template. **With a locale beyond `en` and `fr`, `templates` must now include `welcome` too.** Until it does, the call does not compile, and in JavaScript `janusMail()` throws a `TypeError` that lists the missing templates.

## 0.3.2

### Patch Changes

- [#134](https://github.com/softistx/nxgt-janus/pull/134) [`ec0cc80`](https://github.com/softistx/nxgt-janus/commit/ec0cc80138deb8eaa68a08fb1f799bfb0bdb2f20) Thanks [@SteveGT96](https://github.com/SteveGT96)! - In dark mode the sign-in code's box is no longer a light slab. It is now a mid slate (`#94a3b8`), a clear step above the dark card (6.95:1), and the code on it stays near-black, at 7.76:1. The page behind the card is darker again (`#040a19`), so the card stands out from it more than in 0.3.1. The e-mails are rebuilt with `@nxgt/mail-ui` 0.6.0 and `@nxgt/mail-presets` 0.4.2. The footer and the notices' "if this was not you" line keep their colour. Gmail still shows the light e-mail. Light mode, the text parts, the subjects, the variables, the manifest (format 1) and the JavaScript are unchanged. The `@nxgt/mail` peer stays `>=0.1.0 <1`. An override that returns its own `html` is not affected.

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
