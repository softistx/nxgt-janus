---
'@nxgt/janus-mail': minor
---

The change notices on their events. `passwordChanged` and `emailChanged` are shown sent from `@nxgt/janus` 0.13's `user.passwordChanged` and `user.emailChanged` events, as the two-factor notices are, rather than right after the call — so the user is told whoever made the change. `emailChanged` goes to the event's `formerEmail`, the inbox the account just left (`@nxgt/mail-presets`' `email-changed` is written for the former address), naming the new one read from the user:

```ts
if (event.type === 'user.emailChanged' && event.formerEmail != null) {
	const user = await auth.get(event.userId);
	await mail.emailChanged({ name: user.name, locale: user.locale, formerEmail: event.formerEmail, newEmail: user.email });
}
```

No change to the methods themselves. Two more plausible mistakes are refused at compile time, thirty-six in all: `event.formerEmail` passed unchecked — it is `null` for a user who had no e-mail — and the event itself passed as the recipient.
