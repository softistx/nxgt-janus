# @nxgt/janus-mail — documentation

The [README](../README.md) shows each e-mail in one example; these pages give
the detail.

| Page | Read it when |
| --- | --- |
| [Sending](guide/sending.md) | You are wiring `janusMail()` into your routes: the options, `clock` among them; each method, the step-up's code, the welcome on `user.created`, the recovery code notice on `user.recoveryCodeUsed` and the change notices on `user.passwordChanged` and `user.emailChanged` among them; the expiry an e-mail states and how to set it, where each e-mail goes, what a failure looks like, retrying and tracing the mailer, and a test |
| [Templates](guide/templates.md) | You want an e-mail of your own: what a template takes and answers, a partial override, `janusTemplates()`, and what the defaults say |
| [Locales](guide/locales.md) | You send in more than one language: how the locale is picked, `fallbackLocale`, fewer locales, and adding one |
| [Building](guide/building.md) | You work on this package: the Maizzle project in `mail/`, `mails/`, the generated files, and why none of it reaches a consumer's build |
| [Troubleshooting](troubleshooting.md) | A `TypeError` at wiring or at a call, a `MailRefused`, a `MailFailure`, a compile error, or an e-mail that reads wrong in dark or light mode |
| [Roadmap](roadmap.md) | You want to know what is coming, and what is deliberately not planned |

## Words

The words **user**, **one-time token**, **one-time code**, **challenge** and
**e-mail flow** are
[`@nxgt/janus`'s vocabulary](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/vocabulary.md);
**mailer**, **transport**, **rendered**, **placeholder** and **manifest** are
[`@nxgt/mail`'s](https://github.com/softistx/nxgt-mail/blob/develop/docs/vocabulary.md).
They mean the same here. These pages add:

| Word | Means | Not |
| --- | --- | --- |
| **e-mail** | One of the eleven this package sends: `verify-email`, `reset-password`, `sign-in-code`, `magic-link`, `confirm-action`, `password-changed`, `email-changed`, `two-factor-enabled`, `two-factor-disabled`, `recovery-code-used`, `welcome` — by the name of its built file | "mail", "message" — a *message* is what a mailer sends, addressed |
| **template** | The function that renders one e-mail: `(variables & { locale }) => Rendered`. Named in camelCase, after the method that sends it: `verifyEmail`, `signInCode` | "renderer" — the renderer is `@nxgt/mail`'s, and reads the build |
| **default template** | A template of `janusTemplates()`: the prebuilt e-mail, filled by the renderer | "preset" — a preset is `@nxgt/mail-presets`' source, which the build compiles |
| **override** | A template of yours, passed in `templates`, used instead of the default | "custom template" |
| **issued** | What a flow answered: an `IssuedToken` from `verifyEmail.send`, `resetPassword.request` or `magicLink.request`, an `IssuedCode` from `signInCode.request`, a `StepUpByEmail` from `stepUp.request` once narrowed to `via: 'email'` | "result", "payload" |
| **recipient** | Who an e-mail is for besides the address: a `Recipient`, `{ name, locale? }` | "user" — a user is a record of `@nxgt/janus`; "to" is the address |
| **notice** | An e-mail that tells, and asks for nothing: `passwordChanged`, `emailChanged`, `twoFactorEnabled`, `twoFactorDisabled`, `recoveryCodeUsed`. It links to `links.secureAccount()` — `recoveryCodeUsed` to `links.recoveryCodes()` when given | "alert", "notification" |
| **welcome** | The e-mail sent once a user was created, on `@nxgt/janus`'s `user.created`: `welcome`. It links to `links.getStarted()` — not a notice, since it warns of nothing | "onboarding", "greeting" |
| **codes left** | How many recovery codes the user still holds, as the recovery code notice says it: `recoveryCodesLeft`, a sentence written from the count with the preset's plural in the recipient's locale — "You have 1 recovery code left." — or passed as text | "remaining codes" — the count itself is `@nxgt/janus`'s `recoveryCodesLeft` |
| **expiry** | How long a link or a code lasts, as the e-mail says it: `expiresIn`, derived from the flow's `expiresAt` in the recipient's locale — "1 hour", "1 heure" — or passed per send | "TTL", "lifetime" — the `tokens` TTL is `@nxgt/janus`'s setting, which sets `expiresAt` |
| **brand** | The name the e-mails show, `janusMail({ brand })`: text, filled at send time | "logo", "company" |
| **the build** | The e-mails as `scripts/build-mail.ts` writes them to `mails/`: HTML and text per locale, and the manifest | "dist" — `mails/` is not `dist/` |
