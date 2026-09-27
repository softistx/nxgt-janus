---
"@nxgt/janus-mail": minor
---

The verification, password-reset and sign-in code e-mails now say how long the link or code lasts: "This link expires in 1 hour.", "Ce lien expire dans 1 heure." The text is derived from the flow's `expiresAt` at send time, in the recipient's locale. The time left is rounded to the minute, then down to the largest whole unit (days, hours or minutes), and formatted with `Intl.NumberFormat`. To give your own wording, pass it as a third argument: `mail.verifyEmail(issued, to, { expiresIn: '24 heures' })`.

- **Breaking.** There are two breaks:
  - `JanusMailVariables` gains `expiresIn` for `verifyEmail`, `resetPassword` and `signInCode`. Code that calls a template directly must now pass it, for example `janusTemplates().resetPassword({ …, expiresIn: '1 heure', locale })` or `mail.templates.verifyEmail({ …, expiresIn, locale })`. An override is given `expiresIn` and may ignore it.
  - `signInCode` now reads `issued.expiresAt`. An argument built by hand, such as `{ code, email }`, must add `expiresAt`. Passing the flow's answer whole still compiles.
- **New errors.** A send whose `expiresAt` is not a valid `Date` (for example, a flow's answer that went through JSON) or is already in the past is a `TypeError`, and nothing is sent.
- **Rebuilt e-mails.** The defaults are rebuilt with `@nxgt/mail-presets` 0.2.0, `@nxgt/mail-config` 0.2.1, `@nxgt/mail-ui` 0.2.0 and `@nxgt/mail-i18n` 0.3.1. The text parts no longer break a sentence across lines. The `@nxgt/mail` peer stays `>=0.1.0 <1`.
- **New option.** `janusMail({ clock })` sets the clock the time left is measured against. Pass it the clock you gave `janus({ clock })`, such as a `fixedClock` in tests. It defaults to the system clock. Tests that give `janus()` a clock set in the past need it here too.
- **New export.** `JanusMailSendOptions` is now exported.
