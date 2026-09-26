# User events

This page is for hearing what happens to a user once it is written: created,
e-mail verified, password reset, deleted. Another service can then follow
without polling. `janus` hands each event to one function you give it;
**delivering it is yours**, or `@nxgt/janus-webhooks`'s once it ships.

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

## The four types

| `type` | Sent by | Not sent |
| --- | --- | --- |
| `user.created` | `create`, `signUp` — once the user is inserted, even if `signUp`'s session then fails to open | for a sign-up refused (`LOGIN_TAKEN`, `USER_INVALID`, `PASSWORD_TOO_SHORT`) |
| `user.emailVerified` | `verifyEmail.confirm`; `resetPassword.confirm`, whose link proves the e-mail; `signInCode.confirm`, whose code does | for an e-mail already verified, or a refused confirm |
| `user.passwordReset` | `resetPassword.confirm` | for `setPassword` or `changePassword` — they are not resets |
| `user.deleted` | `delete`, when it deleted the user | for a replay that finds nobody, or an id of another user type |

A reset whose link verifies the e-mail sends both, `user.passwordReset`
first. Switch on `type`: the four are a closed set, and TypeScript refuses a
fifth.

```ts
function onUserEvent(event: UserEvent): void {
	switch (event.type) {
		case 'user.created':
			return welcome(event.userId);
		case 'user.emailVerified':
			return unlockFeatures(event.userId);
		case 'user.passwordReset':
			return alertSecurityTeam(event.userId);
		case 'user.deleted':
			return forgetEverywhere(event.userId);
	}
}
```

## What an event carries

**The user named by id, and nothing else.** No login, no e-mail, no field of
the schema, no password or hash, no session or one-time token. An event can
land in a queue, a log or another company's endpoint; whoever receives it
reads the rest from where it is kept — `auth.get(event.userId)` — if they
may. A user deleted since is `NOT_FOUND` there, which is the answer.

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

**After the flow's own steps**, and **even when one of them fails**: `delete`
removes the user's sessions and tokens, and `resetPassword.confirm` revokes
the sessions opened with the old password, before the listener runs — so a
listener that takes its time never leaves an old session alive. Those steps
run in a `try`; the event is sent from its `finally`. A store outage there
fails the call, but the event is sent all the same — a retry could not send
it, since `delete` then finds nobody and the reset link is spent.

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
type UserEventType = 'user.created' | 'user.emailVerified' | 'user.passwordReset' | 'user.deleted';

interface UserEvent {
	readonly id: Id;           // a UUIDv7, the key to deliver it once
	readonly type: UserEventType;
	readonly occurredAt: Date; // when the write landed: the createdAt or updatedAt written, or the time read just before a deletion
	readonly userId: Id;
	readonly userType: string;
}

type UserEventListener = (event: UserEvent) => void | Promise<void>;

janus({ ..., events?: UserEventListener });
```

`events` that is not a function is a `TypeError` when `janus()` is called —
see [troubleshooting](../troubleshooting.md#janus-events-must-be-a-function-that-takes-a-user-event--webhooks---from-nxgtjanus-webhooks-or-your-own).

## See also

- [E-mail verification and password reset](email-flows.md) — the flows that send `user.emailVerified` and `user.passwordReset`
- [Users](users.md) — `create`, `signUp`, `delete`
- [Troubleshooting](../troubleshooting.md) — `JANUS_EVENT_FAILED`
