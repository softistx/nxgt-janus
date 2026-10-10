# Errors

This page is for what a client receives when a request is refused or a store
is down, and how that becomes an HTTP status. When you have a message in
hand and want its cause, see [troubleshooting](../troubleshooting.md).

## No error class of its own

This package throws `GraphQLError` for a denial, and lets `@nxgt/janus`'s own
errors through. Every error it answers carries a `code` and a status in its
`extensions`:

```ts
new GraphQLError('Not signed in', {
	extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
});
```

Yoga reads `extensions.http.status` to answer the HTTP response, and strips
`http` from the body, so the client sees:

```json
{
	"data": { "me": null },
	"errors": [{ "message": "Not signed in", "path": ["me"], "extensions": { "code": "UNAUTHENTICATED" } }]
}
```

## The codes

| Code | Status | Message | When |
| --- | --- | --- | --- |
| `UNAUTHENTICATED` | 401 | `Not signed in` | An anonymous request reached a guarded field, `requireUser()` or `requireFresh()` |
| `FORBIDDEN` | 403 | `Forbidden` | A user of a type the directive or `requireUser({ type })` does not name, or a `@permission(onDeny: FORBIDDEN)` denied |
| `STEP_UP_REQUIRED` | 403 | `Forbidden` | A session older than `@fresh(maxAge)` or `requireFresh(ctx, maxAge)` allows: the client asks for a step-up — see [the step-up over GraphQL](step-up.md) |
| `NOT_FOUND` | 404 | `Not found` | `@permission`'s default denial, a loader answering `null`, an id `@permission` could not read — and `denial('NOT_FOUND')` |
| `SERVICE_UNAVAILABLE` | 503 | `The service is unavailable, retry later` | A store could not answer: `STORE_FAILED` |
| any other `JanusErrorCode` | its `statusOf(code)` | fixed per status: `Invalid request` 400, `Invalid credentials` 401 (`CREDENTIALS_INVALID`, `CODE_INVALID`), `Forbidden` 403, `Not found` 404, `Conflict` 409, `Internal server error` 500 and 501 | A `JanusError` a resolver let through — `CREDENTIALS_INVALID` 401, `LOGIN_TAKEN` 409, `TOKEN_EXPIRED` 400, … |

The status of every `JanusErrorCode` is `@nxgt/janus`'s
[`statusOf`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/errors.md),
the table `@nxgt/janus-hono` answers with too.

What a refusal carries beyond `code` is only what the client can act on:
`issues` for `USER_INVALID`, `minLength` for `PASSWORD_TOO_SHORT`,
`attemptsLeft` for `CODE_INVALID`, `retryAfter` for a throttled
`CREDENTIALS_INVALID` or `MAIL_THROTTLED` — with its `Retry-After` header. **Never** `reason`, `login`, `slot`,
`operation`, a hash prefix or a cause — those are for your logs. **The
message is never the core's**: `@nxgt/janus`'s messages name a hash prefix or
a record's versions, so every `JanusError` gets the fixed message of its
status, and a client tells refusals apart by `code`.

## An outage is never a denial

**An absence is `null`; a failure throws** — and here a failure is never
answered `UNAUTHENTICATED`, `FORBIDDEN` or `NOT_FOUND`. A 401 during an
outage tells every user they are signed out; a 403 tells them they lost their
rights; a 404 tells them the record is gone. All send them somewhere a retry
would not.

| Where the store fails | Answered |
| --- | --- |
| a field `@authenticated` or `@permission` guards | `SERVICE_UNAVAILABLE`, 503 — with or without `janusMaskError()` |
| a `loaders` entry throwing `StoreFailure` — or any `JanusError` — for `@permission` | the `JanusError`'s status: `SERVICE_UNAVAILABLE`, 503, for `STORE_FAILED` — with or without `janusMaskError()` |
| `requireUser(ctx)`, `can(ctx, …)` | `SERVICE_UNAVAILABLE`, 503 — with or without `janusMaskError()` |
| `ctx.janus.user()` read in a resolver, any `auth.*` or `access.*` call | `SERVICE_UNAVAILABLE`, 503 with `janusMaskError()`; Yoga's masked 500 without it |

## `janusMaskError({ report?, fallback? })`

Yoga masks every error that is not a `GraphQLError` into `Unexpected error.`
with a 500. That is right for a bug and wrong for a `JanusError`: a wrong
password is a 401 the client must see, and an outage a 503 it must retry.

```ts
import { janusMaskError } from '@nxgt/janus-graphql';
import { createYoga, maskError } from 'graphql-yoga';

createYoga({
	schema,
	plugins: [useJanus({ auth })],
	maskedErrors: { maskError: janusMaskError({ fallback: maskError }) },
});
```

A `JanusError` — thrown by a resolver, or wrapped by graphql-js with its path —
is answered as the table above says, at the path it was thrown from. Anything
else goes to `fallback`.

Without a `fallback`, a `GraphQLError` of your own is kept as it is, and
anything else becomes the mask's message with the code
`INTERNAL_SERVER_ERROR` and no detail. Pass Yoga's own `maskError`, as above,
to keep what it shows in development — as `{ fallback }`, or alone:
`janusMaskError(maskError)`, the form from before `report`, still works. The
signature is envelop's too, so the same function fits
`useMaskedErrors({ maskError })`.

## Every outage in your logs: `report`

The client reads a fixed message, and nothing of the store's: which store
failed, and why, is for your logs. A directive — `@authenticated`, `@fresh`,
`@permission` — and `requireUser()`, `requireFresh()` and `can()` answer an
outage 503 themselves, before any resolver of yours runs, so there is no
`try` of yours to log it in. `report` is where it goes:

```ts
createYoga({
	schema,
	plugins: [useJanus({ auth, access })],
	maskedErrors: {
		maskError: janusMaskError({
			report: (error) => logger.error({ code: error.code, cause: error.cause }, error.message),
			fallback: maskError,
		}),
	},
});
```

- **Every 5xx, whichever path it took**: `STORE_FAILED`, `UNSUPPORTED`,
  `PERMISSION_DEPTH` — from a directive, a helper, a loader, or a resolver
  that let it through. `report` is given `@nxgt/janus`'s own error: a
  `StoreFailure` carries the `slot` and `operation` of the call that failed,
  its message and its `cause`.
- **Once per failure.** The user is authenticated once per request, so an
  outage that fails three guarded fields is one error, reported once — and
  answered three times.
- **Never a 4xx**: a denial, `CREDENTIALS_INVALID`, `STEP_UP_REQUIRED` are the
  client's to fix, not yours.
- **It cannot change the answer.** A `report` that throws, or rejects, is a
  `process.emitWarning` naming the code, and the 503 is sent all the same.
  What it answers is ignored.

Yoga's own logger does not cover this: it logs an error only when the mask
replaced it, and a directive's refusal reaches the mask already a
`GraphQLError`, kept as it is — so it is never logged. The same `report` is
`janusErrors({ report })` in `@nxgt/janus-hono`, for the HTTP routes beside
the GraphQL server.

`janusGraphQLError(error)` is the conversion alone, for a resolver that
catches a `JanusError` to answer it itself:

```ts
import { janusGraphQLError } from '@nxgt/janus-graphql';
import { JanusError } from '@nxgt/janus';

try {
	return await auth.patient.signIn(input);
} catch (error) {
	if (error instanceof JanusError) throw janusGraphQLError(error); // CREDENTIALS_INVALID → 401
	throw error;
}
```

**Password guessing is throttled per login by `@nxgt/janus`**: past ten
passwords tried at one login in a 15-minute window, `signIn` refuses every
one, the right password included, until the window ends — nothing locks. A
sign-in mutation that lets the refusal through answers it with no code of
its own:

```json
{
	"errors": [{ "message": "Invalid credentials", "path": ["signIn"], "extensions": { "code": "CREDENTIALS_INVALID", "retryAfter": 840 } }]
}
```

with a 401 and a `Retry-After: 840` header — `janusGraphQLError()` puts it
in `extensions.http.headers`, which Yoga answers with and strips from the
body. `retryAfter` is the seconds until the login's next window.
`janus({ signIn: { throttle } })` changes the limit
([passwords](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/passwords.md#password-guessing-is-throttled)).

**The requests that send an e-mail are throttled too.** Past five requests
for one address (one user, for `verifyEmail.send` and an e-mailed
`stepUp.request`) in a 15-minute window, `@nxgt/janus` throws `MAIL_THROTTLED`
and sends nothing. `janusGraphQLError()` answers it with the fixed message
`Too many requests, retry later`:

```json
{
	"errors": [{ "message": "Too many requests, retry later", "extensions": { "code": "MAIL_THROTTLED", "retryAfter": 840 } }]
}
```

with a 429 and a `Retry-After: 840` header, as above. `janus({ mail: { throttle } })`
changes the limit.

What the throttle does not see is one password tried against many logins:
limit a sign-in mutation **per client address** as well, in the resolver,
with the limiter you already run:

```ts
import { GraphQLError } from 'graphql';

if (!(await limiter.consume(`sign-in:${clientAddress}`))) {
	throw new GraphQLError('Too many attempts', {
		extensions: { code: 'TOO_MANY_REQUESTS', http: { status: 429 } },
	});
}
return await auth.patient.signIn(input);
```

Yoga answers the `http.status` of the extensions. Limit a `changePassword`
mutation per user too: it compares the current password.

## The status of a response

Yoga answers **the highest status among the errors**. A query whose fields
are refused for different reasons is answered with the worst of them, and a
query where one field is refused and the others answered is still that
field's status:

| The query, anonymous | Status | `data` |
| --- | --- | --- |
| `{ open }` | 200 | `{ open }` |
| `{ me }` | 401 | `{ me: null }` |
| `{ open me }` | 401 | `{ open, me: null }` |

A client reads `data` and `errors`, not only the status.

## Your own denials

`denial(code, message?)` is the `GraphQLError` the guards throw, for a
resolver that refuses on its own terms:

```ts
import { denial } from '@nxgt/janus-graphql';

if (record.archived) throw denial('NOT_FOUND', 'No such record');
```

| `code` | Status |
| --- | --- |
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
