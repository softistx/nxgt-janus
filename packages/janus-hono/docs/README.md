# @nxgt/janus-hono — documentation

The [README](../README.md) shows the whole wiring in one example; these pages
give the detail.

| Page | Read it when |
| --- | --- |
| [The routes of an application](guide/routes.md) | You are writing sign-up, sign-in, a second factor's code, sign-out and the e-mail flows as Hono routes, with one user type or several |
| [Guarded routes and writing tuples](guide/permissions.md) | You are guarding a route with a permission, passing a condition's context, or granting and revoking from a route |
| [Troubleshooting](troubleshooting.md) | A route answers something you did not expect, or the compiler refuses one |
| [Roadmap](roadmap.md) | You want to know what is coming, what shipped, and what is deliberately not planned |

The words — user, session, object, permission, failure, denial — are
[`@nxgt/janus`'s vocabulary](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/vocabulary.md),
and mean the same here.
