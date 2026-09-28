---
'@nxgt/janus': minor
---

`statusOf(code)` is exported from `@nxgt/janus`: the HTTP status each `JanusErrorCode` deserves — `STORE_FAILED` 503 and nothing else, `NOT_FOUND` 404, `CREDENTIALS_INVALID` and `CODE_INVALID` 401, … — typed as `JanusErrorStatus`, the union of the eight literals it answers. It is the one table the integrations share, so a Hono route and a GraphQL field answer a code the same way; the errors guide now imports it instead of writing it out.

`CheckArgs<C, T, P>`, the options argument of `can()` — `ctx` required exactly when a `when` is reachable — is exported from `@nxgt/janus/permissions` as a type, for a function of your own that wraps `can()` and should refuse the same mistakes.
