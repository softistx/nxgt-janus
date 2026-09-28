# @nxgt/janus-graphql — documentation

The [README](../README.md) shows the whole wiring in one example; these pages
give the detail.

| Page | Read it when |
| --- | --- |
| [Directives](guide/directives.md) | You are guarding fields, types or interfaces with `@authenticated`, `@fresh` or `@permission`: where the id is read, loaders and conditions, lists, the order, the denials, one check per question, and what is refused at start-up |
| [The step-up over GraphQL](guide/step-up.md) | A mutation must run only on a session that proved who it is recently: `@fresh`, `STEP_UP_REQUIRED`, `stepUp.request` and `confirm` as mutations, `requireFresh()`, subscriptions, and testing with a clock |
| [Subscriptions over graphql-ws](guide/subscriptions.md) | You serve subscriptions over a WebSocket: `janusConnection()`, the cookie or `connectionParams`, the close codes, a session revoked mid-stream, Bun, and a server without Yoga |
| [The context](guide/context.md) | You are reading the user in a resolver, narrowing it to a user type, or checking a permission or freshness yourself with `requireUser()`, `requireFresh()` and `can()` |
| [Errors](guide/errors.md) | You want to know what a client receives for a denial or an outage, what the status of the response is, and how `janusMaskError()` fits Yoga's masking |
| [Telemetry](guide/telemetry.md) | You want a span per authentication and per permission check, with `@nxgt/janus-telemetry` |
| [Federation](guide/federation.md) | The server is a subgraph: where the directives are checked, what the router must forward, and `@composeDirective` |
| [Troubleshooting](troubleshooting.md) | A query answers something you did not expect, the server refuses to start, or the compiler refuses a resolver |
| [Roadmap](roadmap.md) | You want to know what is coming — the renewed session cookie — and what is deliberately not planned |

The words — user, user type, session, subject, permission, failure, denial —
are [`@nxgt/janus`'s vocabulary](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/vocabulary.md),
and mean the same here.
