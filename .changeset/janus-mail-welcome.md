---
'@nxgt/janus-mail': minor
---

A new e-mail: `mail.welcome(to)`. It welcomes `to.email` by name ("Welcome, Ada" / "Bienvenue, Ada"), and its **Get started** button links to the new `links.getStarted()`, the page where a new user starts: your home page, or your sign-in page for an account someone else created. It is built in English and French from `@nxgt/mail-presets` 0.4.2's `welcome`. Send it on `@nxgt/janus`'s `user.created` event, which `auth.signUp` and `auth.create` send once the user is inserted:

```ts
if (event.type === 'user.created') {
	const user = await auth.get(event.userId);
	await mail.welcome({ name: user.name, locale: user.locale, email: user.email });
}
```

**`links` must now include `getStarted`.** Until it does, the `janusMail()` call does not compile, and in JavaScript `janusMail()` throws `TypeError: janusMail: links.getStarted must be a function`. Add it even if you never send the welcome.

`janusTemplates()`, `JanusMailTemplates` and `JanusMailVariables` gain the `welcome` template. **With a locale beyond `en` and `fr`, `templates` must now include `welcome` too.** Until it does, the call does not compile, and in JavaScript `janusMail()` throws a `TypeError` that lists the missing templates.
