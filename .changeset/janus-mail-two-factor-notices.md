---
'@nxgt/janus-mail': minor
---

Two new notices: `mail.twoFactorEnabled(to)` and `mail.twoFactorDisabled(to)`. They tell `to.email` that two-factor authentication was turned on or off, and link to `links.secureAccount()`, the page where the user manages their security settings. They are built in English and French from `@nxgt/mail-presets` 0.4.0's `two-factor-enabled` and `two-factor-disabled`. Send them on `@nxgt/janus`'s new `user.secondFactorEnabled` and `user.secondFactorDisabled` events:

```ts
if (event.type === 'user.secondFactorDisabled') {
	const user = await auth.get(event.userId);
	await mail.twoFactorDisabled({ name: user.name, locale: user.locale, email: user.email });
}
```

`janusTemplates()`, `JanusMailTemplates` and `JanusMailVariables` gain the two templates. **With a locale beyond `en` and `fr`, `templates` must now include `twoFactorEnabled` and `twoFactorDisabled` too.** Until it does, the call does not compile, and in JavaScript `janusMail()` throws a `TypeError` that lists the missing templates.
