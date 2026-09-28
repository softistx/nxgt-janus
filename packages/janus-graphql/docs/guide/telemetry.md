# Telemetry

This page is for tracing what the GraphQL server asks of `@nxgt/janus`: a span
per authentication and per permission check, with
[`@nxgt/janus-telemetry`](https://www.npmjs.com/package/@nxgt/janus-telemetry).

`@nxgt/janus-graphql` does not depend on it, and has nothing to configure for
it: `useJanus()` takes the instances you give it, and an instrumented
instance answers exactly as the plain one does, with the same types.

```ts
import { janus } from '@nxgt/janus';
import { permissions } from '@nxgt/janus/permissions';
import { useJanus } from '@nxgt/janus-graphql';
import { instrumentJanus, instrumentPermissions } from '@nxgt/janus-telemetry';

export const auth = instrumentJanus(janus({ users, hasher, ...stores }));
export const access = instrumentPermissions(permissions({ model, store }));

useJanus({ auth, access, loaders, conditions });
```

`instrumentPermissions(access)` answers a frozen copy that keeps `model`, so
`@permission` reads the model from it when the schema is built, and every
check — a directive's or `can()`'s — goes through the traced `can`.

## What shows up

| Span | Written for |
| --- | --- |
| `janus.authenticate` | The first `ctx.janus.user()` or `ctx.janus.session()` of a request — a guarded field asks it — and never when neither is asked. Once per request |
| `janus.can` | Each **distinct** permission check of a request: `@permission`'s and `can()`'s |

The spans nest under the server span of whatever opened one — an
OpenTelemetry instrumentation of your server, or `@nxgt/telemetry`'s own.

**A question answered from the request's memo writes no span.** The memo sits
between `ctx.janus` and `access.can`, so the same object, permission and user
asked twice in one request — two fields, or a directive and `can()` — is one
`janus.can`. A check with a condition's `ctx` is never remembered, and
writes one span each time.

**A loader is yours to trace.** `loaders[type](id, ctx)` runs your code; what
it asks of your database shows up as your database's instrumentation writes
it, not as a `janus.*` span.
