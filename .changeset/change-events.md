---
'@nxgt/janus': minor
---

Two new user events, so a listener can tell the user their password or e-mail changed — whoever changed it:

- **`user.passwordChanged`**, sent by `changePassword` and `setPassword` once the password is written and the older reset links and second-factor challenges are spent — from a `finally`, so an outage spending them still reports the write. A reset is still `user.passwordReset` alone, never both: a listener that cares about every new password handles both types. A `changePassword` refused sends nothing; a first password `setPassword` gives a user created without one sends it too.
- **`user.emailChanged`**, sent by an `update` that changed the e-mail — added, replaced or removed — compared normalised, the same test that makes the new address unverified: a change of case only sends nothing. It carries **`formerEmail`**, the address before the update as it was stored, or `null` for a user who had none — the one event that carries more than the user's id, since nothing keeps the old address once the write landed and a notice belongs in that inbox:

```ts
if (event.type === 'user.emailChanged' && event.formerEmail != null) {
	const user = await auth.get(event.userId);
	await mail.emailChanged({ name: user.name, formerEmail: event.formerEmail, newEmail: user.email });
}
```

`UserEvent` gains `formerEmail?: string | null`, absent on every other type. Both are sent after the write, awaited, and a listener that throws is a `JANUS_EVENT_FAILED` warning, never a failed flow, as for the other types.

**Breaking for an exhaustive `switch`: `UserEventType` has two more members**, `'user.passwordChanged'` and `'user.emailChanged'`. A `switch` that exhausts it no longer compiles until it handles them. Receivers on `@nxgt/janus-webhooks` before 0.6.0 answer `null` for the two new types, and a `@nxgt/janus-webhooks-redis` queue before 0.4.0 cannot read them back: upgrade them first, or leave the types out of their endpoint's `types`.
