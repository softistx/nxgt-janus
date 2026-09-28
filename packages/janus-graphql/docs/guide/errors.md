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
| `UNAUTHENTICATED` | 401 | `Not signed in` | An anonymous request reached a field `@authenticated` guards, or `requireUser()` |
| `FORBIDDEN` | 403 | `Forbidden` | A user of a type the directive or `requireUser({ type })` does not name |
| `NOT_FOUND` | 404 | `Not found` | `denial('NOT_FOUND')` — and, once it lands, `@permission`'s default denial |
| `SERVICE_UNAVAILABLE` | 503 | `The service is unavailable, retry later` | A store could not answer: `STORE_FAILED` |
| any other `JanusErrorCode` | its `statusOf(code)` | the error's own | A `JanusError` a resolver let through — `CREDENTIALS_INVALID` 401, `LOGIN_TAKEN` 409, `TOKEN_EXPIRED` 400, … |

The status of every `JanusErrorCode` is `@nxgt/janus`'s
[`statusOf`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/errors.md),
the table `@nxgt/janus-hono` answers with too.

What a refusal carries beyond `code` is only what the client can act on:
`issues` for `USER_INVALID`, `minLength` for `PASSWORD_TOO_SHORT`,
`attemptsLeft` for `CODE_INVALID`. **Never** `reason`, `login`, `slot`,
`operation` or a cause — those are for your logs. A 5xx carries a fixed
message, never the store's.

## An outage is never a denial

**An absence is `null`; a failure throws** — and here a failure is never
answered `UNAUTHENTICATED` or `FORBIDDEN`. A 401 during an outage tells every
user they are signed out; a 403 tells them they lost their rights. Both send
them somewhere a retry would not.

| Where the store fails | Answered |
| --- | --- |
| a field `@authenticated` guards | `SERVICE_UNAVAILABLE`, 503 — with or without `janusMaskError()` |
| `requireUser(ctx)`, `can(ctx, …)` | `SERVICE_UNAVAILABLE`, 503 — with or without `janusMaskError()` |
| `ctx.janus.user()` read in a resolver, any `auth.*` or `access.*` call | `SERVICE_UNAVAILABLE`, 503 with `janusMaskError()`; Yoga's masked 500 without it |

## `janusMaskError(fallback?)`

Yoga masks every error that is not a `GraphQLError` into `Unexpected error.`
with a 500. That is right for a bug and wrong for a `JanusError`: a wrong
password is a 401 the client must see, and an outage a 503 it must retry.

```ts
import { janusMaskError } from '@nxgt/janus-graphql';
import { createYoga, maskError } from 'graphql-yoga';

createYoga({
	schema,
	plugins: [useJanus({ auth })],
	maskedErrors: { maskError: janusMaskError(maskError) },
});
```

A `JanusError` — thrown by a resolver, or wrapped by graphql-js with its path —
is answered as the table above says, at the path it was thrown from. Anything
else goes to `fallback`.

Without a `fallback`, a `GraphQLError` of your own is kept as it is, and
anything else becomes the mask's message with the code
`INTERNAL_SERVER_ERROR` and no detail. Pass Yoga's own `maskError`, as above,
to keep what it shows in development. The signature is envelop's too, so the
same function fits `useMaskedErrors({ maskError })`.

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
