---
'@nxgt/janus-mail': minor
---

New e-mail: `mail.recoveryCodeUsed(to, { when, recoveryCodesLeft })`. It tells `to.email` that one of their recovery codes was used to sign in without their phone, says when, and says how many codes are left. It is built in English and French from `@nxgt/mail-presets` 1.0.0's `recovery-code-used`. Send it on `@nxgt/janus`'s `user.recoveryCodeUsed` event. That event carries only the user's id, so read the count with `auth.secondFactor.recoveryCodesLeft(user)` (new in `@nxgt/janus` 0.11):

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
