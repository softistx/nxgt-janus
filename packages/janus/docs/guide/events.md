# User events

This page is for hearing what happens to a user once it is written: created,
e-mail verified, password reset or changed, e-mail changed, second factor
turned on or off, recovery codes regenerated or one used, a sign-in from a
new device, deleted. Another service can then follow
without polling. `janus` hands each event to one function you give it;
**delivering it is yours** — or
[`@nxgt/janus-webhooks`](https://www.npmjs.com/package/@nxgt/janus-webhooks)'s:
`webhooks({ endpoints })` signs and posts each event.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher, type UserEvent } from '@nxgt/janus';

const received: UserEvent[] = [];

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	events(event) {
		received.push(event);
	},
});

const { user } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
received[0];
// {
//   id: '0199…',            a UUIDv7 minted for this event
//   type: 'user.created',
//   occurredAt: Date,       when the write landed — its createdAt here
//   userId: user.id,
//   userType: 'user',
// }
```

The words — **user event**, **listener** — are defined in
[the vocabulary](vocabulary.md#identities).

## The eleven types

| `type` | Sent by | Not sent |
| --- | --- | --- |
| `user.created` | `create`, `signUp` — once the user is inserted, even if `signUp`'s session then fails to open | for a sign-up refused (`LOGIN_TAKEN`, `USER_INVALID`, `PASSWORD_TOO_SHORT`) |
| `user.emailVerified` | `verifyEmail.confirm`; `resetPassword.confirm` and `magicLink.confirm`, whose link proves the e-mail; `signInCode.confirm`, whose code does | for an e-mail already verified, or a refused confirm |
| `user.passwordReset` | `resetPassword.confirm` | for `setPassword` or `changePassword` — they are not resets |
| `user.passwordChanged` | `changePassword` and `setPassword` — a first password set on a user created without one included — once the password is written — even if spending the reset links and second-factor challenges it ends then fails; `signInCode.confirm` and `magicLink.confirm` when their first proof of the e-mail dropped a password, after `user.emailVerified` | for a reset, which is `user.passwordReset` alone; for a `changePassword` refused (`CREDENTIALS_INVALID`) |
| `user.emailChanged` | `update`, when it changed the e-mail — added, replaced or removed. It carries `formerEmail`, the address before | for an update that leaves the e-mail alone, or changes only its case (`Ada@…` for `ada@…`): compared normalised, the same test that makes the new address unverified; for a type with no e-mail; for an update refused |
| `user.secondFactorEnabled` | `secondFactor.activate`, once the first code made the factor active | for `enroll`, which leaves the factor waiting and asked for nowhere; for a code refused |
| `user.secondFactorDisabled` | `secondFactor.disable`, when it removed an **active** factor; `signInCode.confirm` and `magicLink.confirm` when their first proof of the e-mail removed one, after `user.emailVerified` and any `user.passwordChanged` — even if an outage interrupts the sign-outs | for a user who had no factor, a factor still waiting for its first code — it was never asked for — or a second `disable` |
| `user.recoveryCodesRegenerated` | `secondFactor.regenerateRecoveryCodes`: the codes the user held stopped working | for `activate`, whose first codes come with `user.secondFactorEnabled`; for a code refused |
| `user.recoveryCodeUsed` | `secondFactor.recover`, once the recovery code is spent — even if opening the session then fails | for a recovery code refused. How many are left is not in the event: `secondFactor.recoveryCodesLeft(event.userId)` reads it |
| `user.newDeviceSignedIn` | `signIn`, `secondFactor.confirm`, `secondFactor.recover`, `signInCode.confirm` and `magicLink.confirm`, given a `device` whose token did not prove this user signed in there — once the sign-in is complete. It carries `sessionId`, the new session's. See [devices](devices.md) | for `signUp`, which mints the first token; for a call given no `device`; for a known device; for a challenge, which opens no session; for a sign-in refused — a wrong password, or a `signIn` refused after its session opened because a password was written meanwhile |
| `user.deleted` | `delete`, when it deleted the user | for a replay that finds nobody, or an id of another user type |

A reset whose link verifies the e-mail sends both, `user.passwordReset`
first. **A reset does not also send `user.passwordChanged`**: a listener that
cares about every new password handles both types, as the `switch` below
does — one event per write, rather than two a listener would have to tell
apart. Switch on `type`: the eleven are a closed set, and TypeScript refuses a
twelfth. A new type is a compile error in a `switch` that exhausts them — the
two recovery-code types, added in 0.10, the two change types, added in
0.14, and `user.newDeviceSignedIn`, added in 0.17, each broke such a `switch`
until it handled them.

```ts
function onUserEvent(event: UserEvent): void {
	switch (event.type) {
		case 'user.created':
			return welcomeTheUser(event.userId); // reads the user, then @nxgt/janus-mail's mail.welcome
		case 'user.emailVerified':
			return unlockFeatures(event.userId);
		case 'user.passwordReset':
		case 'user.passwordChanged':
			return noticeTheUser(event); // @nxgt/janus-mail's passwordChanged — see below
		case 'user.emailChanged':
			return noticeTheFormerAddress(event); // to event.formerEmail — see below
		case 'user.secondFactorEnabled':
		case 'user.secondFactorDisabled':
			return noticeTheUser(event); // @nxgt/janus-mail's twoFactorEnabled or twoFactorDisabled
		case 'user.recoveryCodesRegenerated':
			return;
		case 'user.recoveryCodeUsed':
			return warnTheUser(event.userId); // a sign-in without their phone — see below
		case 'user.newDeviceSignedIn':
			return warnTheUser(event.userId); // @nxgt/janus-mail's newSignIn — see below
		case 'user.deleted':
			return forgetEverywhere(event.userId);
	}
}
```

### Telling the user a recovery code was used

A recovery code used by someone else is a sign-in without the user's phone,
so tell the user each time — and how many codes they have left, which the
event does not carry: `secondFactor.recoveryCodesLeft` reads it, after the
write, so the code just spent is already out of the count.
[`@nxgt/janus-mail`](https://www.npmjs.com/package/@nxgt/janus-mail)'s
`recoveryCodeUsed` is the e-mail, in English and French:

```ts
// `mail` is janusMail({ … }), and the user schema holds a name and a locale.
const auth = janus({
	...config,
	async events(event) {
		if (event.type === 'user.recoveryCodeUsed') {
			const user = await auth.get(event.userId);
			const recoveryCodesLeft = await auth.secondFactor.recoveryCodesLeft(user);
			if (recoveryCodesLeft === null) return; // the factor was turned off since
			const when = new Intl.DateTimeFormat(user.locale, {
				dateStyle: 'long',
				timeStyle: 'short',
				timeZone: 'Europe/Paris', // the user's, when you keep it
			}).format(event.occurredAt);
			await mail.recoveryCodeUsed(
				{ name: user.name, locale: user.locale, email: user.email },
				{ when, recoveryCodesLeft }, // "You have 9 recovery codes left."
			);
		}
	},
});
```

With several user types, the count is the type's:
`auth.patient.secondFactor.recoveryCodesLeft(event.userId)`, on
`event.userType`.

### Telling the user a new device signed in

A sign-in from a device the user had not signed in from is how a stolen
password shows, so tell the user.
[`@nxgt/janus-mail`](https://www.npmjs.com/package/@nxgt/janus-mail)'s
`newSignIn` is the e-mail — the device, the time and, when you know it, the
place, each your text in the user's locale:

```ts
// `mail` is janusMail({ … }), and the user schema holds a name and a locale.
const auth = janus({
	...config,
	async events(event) {
		if (event.type === 'user.newDeviceSignedIn') {
			const user = await auth.get(event.userId);
			const time = new Intl.DateTimeFormat(user.locale, {
				dateStyle: 'long',
				timeStyle: 'short',
				timeZone: 'Europe/Paris', // the user's, when you keep it
			}).format(event.occurredAt); // the new session's createdAt
			await mail.newSignIn({ name: user.name, locale: user.locale, email: user.email }, { device: 'a new device', time });
		}
	},
});
```

The event has no request, so it cannot say which device: send from the
sign-in's answer instead — `if (signedIn.newDevice) …` — to name it from
the `User-Agent`. [Devices](devices.md#the-e-mail-nxgtjanus-mails-newsignin)
has both.

### Telling the user their password or e-mail changed

A password changed by someone else, or an e-mail moved to their inbox, is how
an account is taken over — so tell the user each time. For a password, read
the user and write to their address. For an e-mail, write to the **former**
address: the new one belongs to whoever changed it. The event carries it,
since nothing else keeps it once the write landed:

```ts
// `mail` is janusMail({ … }), and the user schema holds a name and a locale.
const auth = janus({
	...config,
	async events(event) {
		if (event.type === 'user.passwordChanged') {
			const user = await auth.get(event.userId);
			await mail.passwordChanged({ name: user.name, locale: user.locale, email: user.email });
		}
		if (event.type === 'user.emailChanged' && event.formerEmail != null) {
			const user = await auth.get(event.userId);
			await mail.emailChanged({
				name: user.name,
				locale: user.locale,
				formerEmail: event.formerEmail, // to the inbox the account just left
				newEmail: user.email,
			});
		}
	},
});
```

`formerEmail` is `null` for a user who had no e-mail before the update:
there is no former inbox to tell. The example assumes a required e-mail; with
an optional one, an update that removes it sends the event too, and the user
read back has no `newEmail` to name — check `user.email` before the notice. Pass the same notices on `user.passwordReset`
too, if a reset should be told as well.

## What an event carries

**The user named by id, and nothing else** — with two exceptions, below. No
login, no field of the schema, no password or hash, no session or one-time
token. An event can
land in a queue, a log or another company's endpoint; whoever receives it
reads the rest from where it is kept — `auth.get(event.userId)` — if they
may. A user deleted since is `NOT_FOUND` there, which is the answer.

**The first exception is `formerEmail`, on `user.emailChanged` only**: the address
the user had before the update, as it was stored, or `null` when they had
none. Once the write landed it is kept nowhere else, and a notice to the
inbox the account just left needs it. It is absent from every other type.
`@nxgt/janus-webhooks` does not carry it: it strips it before the queue, so
it reaches no endpoint, no queue and no `onGivingUp` report — send the
notice from the listener, in the process that wrote.

**The second is `sessionId`, on `user.newDeviceSignedIn` only**: the id of
the session the new device opened, so a "this wasn't me" page can end that
one. It is absent from every other type, and `@nxgt/janus-webhooks` strips
it as it strips `formerEmail`.

`id` is minted for the event, a UUIDv7 that sorts by time. Deliver on it:
a queue job id, a primary key, a webhook's `webhook-id` header. Two events
never share one.

## When the listener runs

After the write, **awaited**, before the flow answers. So a listener
that stores the event durably — a job queue, an outbox table — has done so
when `signUp` answers:

```ts
const auth = janus({
	...config,
	async events(event) {
		await jobs.add(event.type, event, { jobId: event.id });
	},
});
```

Where the listener runs within a flow, and what an outage does to it:

| Flow | The listener runs | A store outage after the write |
| --- | --- | --- |
| `create` | after the insert — its last step | — |
| `signUp` | after the insert, **before** the session is opened | fails the call; the event is already sent |
| `verifyEmail.confirm` | after the write — the flow's last step | — |
| `update` | after the write — the flow's last step | — |
| `changePassword`, `setPassword` | **after** the reset links and the second-factor challenges left open are spent | fails the call; the event is sent all the same, from a `finally` |
| `signInCode.confirm`, `magicLink.confirm` | on an e-mail never verified: **after** every session is revoked and the reset links and second-factor challenges left open are spent — before the write and again after it — and **before** the new session or second-factor challenge is opened. `user.passwordChanged` follows `user.emailVerified` when a password was dropped, then `user.secondFactorDisabled` when an active second factor was removed. An e-mail already verified sends nothing | fails the call; the events are sent all the same, from a `finally`. An outage in the sign-outs before the write fails the call with nothing written and nothing sent: the next code or link proves the e-mail again |
| `secondFactor.activate`, `secondFactor.regenerateRecoveryCodes`, `secondFactor.disable` | after the write — the flow's last step | — |
| `secondFactor.recover` | after the recovery code is spent and the session opened — or failed to open | fails the call; the recovery code is spent and the event sent all the same, from a `finally` |
| `signIn`, `secondFactor.confirm`, `secondFactor.recover`, `signInCode.confirm`, `magicLink.confirm` — `user.newDeviceSignedIn` | **last**, once the session is open and the sign-in complete: after `user.recoveryCodeUsed`, and after the events of a first proof of the e-mail | fails the call, and `user.newDeviceSignedIn` is not sent: it comes only once the sign-in is complete |
| `resetPassword.confirm` | **after** the sessions opened with the old password are revoked, and the other reset links and the second-factor challenges left open are spent | fails the call; the events are sent all the same, from a `finally` |
| `delete` | **after** the user's sessions and one-time tokens are removed, and the relation tuples naming them when `relations` is wired | fails the call; the event is sent all the same, from a `finally` |

So a listener that takes its time never leaves an old session alive after a
reset, one that hears of a password changed finds the older reset links
already spent, and one that checks permissions on `user.deleted` finds the
tuples gone. A retry could not send a lost event either way: `delete` then finds
nobody, and the reset link is spent.

`occurredAt` is the write's own time: the `createdAt` or `updatedAt` it
wrote, the time read just before the deletion — not when the listener ran.

It runs inline, so it costs every flow that sends an event: store the event
and return. Sending an HTTP request from the listener makes every sign-up as
slow as the slowest endpoint, and as fragile.

## When the listener fails

**It fails no flow.** The write happened: answering `signUp` with an error
would tell the visitor their account does not exist when it does, and a retry
would hit `LOGIN_TAKEN`. So a listener that throws, or rejects, is a warning:

```
(node:4242) [JANUS_EVENT_FAILED] Warning: janus: the events listener failed on user.created 0199… for user 0199…: Error
```

It names the event's type, its `id` and the user's id — what it takes to send
it again — and the failure's name, never its message, which may hold anything.
Listen for it where you watch your process's health:

```ts
process.on('warning', (warning) => {
	if ((warning as { code?: string }).code === 'JANUS_EVENT_FAILED') {
		metrics.increment('janus.events.failed');
		logger.error(warning.message);
	}
});
```

## What is not promised

**At most once, from the process that wrote.** The event is handed to the
listener after the write, in memory: a crash between the two loses it, and
nothing sends it later — there is no outbox in the store. What must never
miss one — a billing sync, a search index — also reads the users now and
then, and treats events as the fast path.

**No order across processes.** Two instances each hand their own events to
their own listener. `occurredAt` and the time-sorted `id` let a receiver put
them back in order.

## In a test

```ts
import { expect, it } from 'bun:test';
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher, type UserEvent } from '@nxgt/janus';

it('tells the CRM about a sign-up', async () => {
	const received: UserEvent[] = [];
	const auth = janus({
		user: z.object({ email: z.email() }),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }),
		events: (event) => void received.push(event),
	});

	const { user } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });

	expect(received).toEqual([expect.objectContaining({ type: 'user.created', userId: user.id })]);
});
```

## Signatures

```ts
type UserEventType =
	| 'user.created'
	| 'user.emailVerified'
	| 'user.passwordReset'
	| 'user.passwordChanged'
	| 'user.emailChanged'
	| 'user.secondFactorEnabled'
	| 'user.secondFactorDisabled'
	| 'user.recoveryCodesRegenerated'
	| 'user.recoveryCodeUsed'
	| 'user.newDeviceSignedIn'
	| 'user.deleted';

interface UserEvent {
	readonly id: Id;           // a UUIDv7, the key to deliver it once
	readonly type: UserEventType;
	readonly occurredAt: Date; // when the write landed: the createdAt or updatedAt written, or the time read just before a deletion
	readonly userId: Id;
	readonly userType: string;
	readonly formerEmail?: string | null; // on user.emailChanged only: the address before, null for none
	readonly sessionId?: string;          // on user.newDeviceSignedIn only: the session the new device opened
}

type UserEventListener = (event: UserEvent) => void | Promise<void>;

janus({ ..., events?: UserEventListener });
```

`events` that is not a function is a `TypeError` when `janus()` is called —
see [troubleshooting](../troubleshooting.md#janus-events-must-be-a-function-that-takes-a-user-event--webhooks---from-nxgtjanus-webhooks-or-your-own).

## See also

- [E-mail verification and password reset](email-flows.md) — the flows that send `user.emailVerified` and `user.passwordReset`
- [The second factor](second-factor.md) — `activate` and `disable`, which send `user.secondFactorEnabled` and `user.secondFactorDisabled` — sent too by the first proof of an e-mail by a [code](sign-in-code.md) or a [link](magic-link.md#an-account-someone-else-registered); [recovery codes](second-factor.md#recovery-codes), which send `user.recoveryCodesRegenerated` and `user.recoveryCodeUsed`
- [Devices](devices.md) — the sign-ins that send `user.newDeviceSignedIn`, the device token and the cookie
- [Users](users.md) — `create`, `signUp`, `update`, `delete`
- [Passwords](passwords.md) — `changePassword` and `setPassword`, which send `user.passwordChanged`
- [Troubleshooting](../troubleshooting.md) — `JANUS_EVENT_FAILED`
