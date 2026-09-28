# @nxgt/janus-graphql — documentation

The [README](../README.md) shows the whole wiring in one example; these pages
give the detail.

| Page | Read it when |
| --- | --- |
| [The context](guide/context.md) | You are reading the user in a resolver, narrowing it to a user type, guarding fields and types with `@authenticated`, or checking a permission with `can()` |
| [Errors](guide/errors.md) | You want to know what a client receives for a denial or an outage, what the status of the response is, and how `janusMaskError()` fits Yoga's masking |
| [Troubleshooting](troubleshooting.md) | A query answers something you did not expect, the server refuses to start, or the compiler refuses a resolver |
| [Roadmap](roadmap.md) | You want to know what is coming — `@permission` first — and what is deliberately not planned |

The words — user, user type, session, subject, permission, failure, denial —
are [`@nxgt/janus`'s vocabulary](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/vocabulary.md),
and mean the same here.
