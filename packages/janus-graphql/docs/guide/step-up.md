# A step-up over GraphQL

This page is for a mutation a stolen session should not run alone: changing
the e-mail, a payment method, deleting the account. `@fresh(maxAge)` lets it
run only for a session that proved who it is less than `maxAge` seconds ago;
older, it answers `STEP_UP_REQUIRED`, and the client proves it again with a
step-up. `@nxgt/janus` issues and checks the code, and stamps the session.
This page shows the whole flow as GraphQL. For the directive alone, see
[directives](directives.md#freshmaxage-int); for the step-up itself, every
error and the codes an app confirms, see
[`@nxgt/janus`'s step-up guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/step-up.md).

## The schema

```graphql
type Mutation {
	changeEmail(email: String!): User @fresh(maxAge: 600)   # ten minutes
	deleteAccount: Boolean! @fresh(maxAge: 300)              # five

	requestStepUp: StepUpChallenge! @authenticated
	confirmStepUp(challenge: String!, code: String!): Boolean! @authenticated
}

type StepUpChallenge {
	challenge: String!
	via: String!   # "email", or "secondFactor": the code is in the user's app
}
```

`@fresh` implies a signed-in user: an anonymous request is `UNAUTHENTICATED`,
401, before freshness is read. The two step-up mutations need a signed-in
user and no fresh one: they are how a session becomes fresh.

## The resolvers

```ts
import { requireUser, type JanusContext } from '@nxgt/janus-graphql';
import type { YogaInitialContext } from 'graphql-yoga';

type Context = YogaInitialContext & JanusContext<typeof auth>;

const resolvers = {
	Mutation: {
		changeEmail: (_: unknown, { email }: { email: string }, ctx: Context) =>
			users.changeEmail(ctx, email), // runs only on a fresh session

		requestStepUp: async (_: unknown, __: unknown, ctx: Context) => {
			const user = await requireUser(ctx); // the session's user — never an id the client sent
			const issued = await auth.stepUp.request(user);
			if (issued.via === 'email') {
				await sendMail(issued.email, 'Confirm it is you', `${issued.code} confirms the action.`);
			}
			return { challenge: issued.challenge, via: issued.via }; // never the code
		},

		confirmStepUp: async (
			_: unknown,
			{ challenge, code }: { challenge: string; code: string },
			ctx: Context,
		) => {
			await auth.stepUp.confirm(ctx.request, challenge, code); // stamps this request's session
			return true;
		},
	},
};
```

`stepUp.confirm` takes the **request**, not a user: it stamps the session
that request presents, and only a standing session of the challenge's user.
`ctx.request` is the `Request` Yoga puts on the context, and carries the same
token or cookie as the mutation that was refused. With several user types,
`stepUp` is on each type that has an e-mail — `auth.patient.stepUp` — and
`requireUser(ctx, { type: 'patient' })` narrows the user to it.

**Wire `janusMaskError()`.** A wrong code is a `JanusError` the resolver lets
through — `CODE_INVALID`, 401, with `attemptsLeft` — and without the mask
Yoga answers it as a 500.

## What the client does

1. It sends `changeEmail`. The session is older than ten minutes:

   ```json
   { "data": { "changeEmail": null },
     "errors": [{ "message": "Forbidden", "path": ["changeEmail"], "extensions": { "code": "STEP_UP_REQUIRED" } }] }
   ```

   The response is a 403. The client reads `extensions.code`, never the
   message, which is the fixed one of the status.

2. It sends `requestStepUp`, and keeps `challenge`. The user reads the code
   in the e-mail — or in their app, when `via` is `"secondFactor"`.

3. It sends `confirmStepUp(challenge, code)`. From now on, the session is
   fresh for `maxAge` seconds.

4. It sends `changeEmail` again, which runs.

| `confirmStepUp` answers | Status | The client |
| --- | --- | --- |
| `true` | 200 | sends the refused mutation again |
| `CODE_INVALID`, with `attemptsLeft` | 401 | asks for the code again; at `0`, starts over at `requestStepUp` |
| `TOKEN_SPENT`, `TOKEN_EXPIRED`, `TOKEN_UNKNOWN`, `TOKEN_STALE` | 400 | starts over at `requestStepUp` |
| `SECOND_FACTOR_ACTIVE` | 409 | starts over: the user's app confirms now |
| `SERVICE_UNAVAILABLE` | 503 | retries later |

**Rate-limit `requestStepUp` per user.** A new challenge takes only a new
request, and each one sends an e-mail: a few an hour is plenty for a person.

## In a resolver: `requireFresh(ctx, maxAge)`

Where the rule depends on the arguments, ask in the resolver:

```ts
import { requireFresh } from '@nxgt/janus-graphql';

const resolvers = {
	Mutation: {
		transfer: async (_: unknown, { amount }: { amount: number }, ctx: Context) => {
			if (amount > 1_000) await requireFresh(ctx, '5m'); // STEP_UP_REQUIRED past five minutes
			return payments.transfer(ctx, amount);
		},
	},
};
```

It answers the session, and refuses as `@fresh` does. `maxAge` is a
duration with its unit — `'5m'`, `'300s'` — never a bare number: the
compiler refuses one, and so does the call at run time, because
`@nxgt/janus` reads a bare number as milliseconds where `@fresh` reads
seconds.

## Subscriptions

**A `@fresh` on the subscription field is checked when it subscribes.** A
stale session is refused before the stream starts; a fresh one keeps
receiving events past `maxAge`, as it keeps its session. `@authenticated`
and `@permission` on the field are asked again on every event; its
`@fresh` is not. To end a stream when the session is no longer fresh, close
it from the server.

**A `@fresh` on the payload's type, or on one of its fields, is checked on
every event**, as any field is: those fields resolve anew for each event,
and once the session is past `maxAge` they answer `STEP_UP_REQUIRED` while
the stream goes on.

```graphql
type Subscription {
	receipts: Receipt @fresh(maxAge: 600) # checked once, when it subscribes
}
type Receipt @fresh(maxAge: 600) {       # checked on every event that carries one
	amount: Int
}
```

## Testing it

`useJanus({ clock })` is the clock `@fresh` and `requireFresh()` read. Give
it the one given to `janus()`, and a spec moves both at once:

```ts
import { fixedClock, janus } from '@nxgt/janus';

const clock = fixedClock(Date.UTC(2026, 0, 1));
const auth = janus({ /* … */ clock });
const yoga = createYoga({ schema, plugins: [useJanus({ auth, clock })] });

const { token } = await auth.signUp({ email, password }); // signed in now
clock.advance(10 * 60_000); // ten minutes later
// changeEmail now answers STEP_UP_REQUIRED
```

Without `clock`, both read the system's. A `janus()` on a fixed clock and a
`useJanus()` without one disagree on the time: a session signed in on
the fixed clock looks days old, and every `@fresh` field answers
`STEP_UP_REQUIRED`.
