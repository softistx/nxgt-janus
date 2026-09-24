# @nxgt/janus — documentation

The [README](../README.md) shows that it works; these pages show how, one area
at a time, with an example for every option.

Janus has two sides, each usable alone — see
[Three ways to use it](../README.md#three-ways-to-use-it) — and the words
below are defined once, in [Words](guide/vocabulary.md#words).

### Identities — `janus()`

| Page | Read it when |
| --- | --- |
| [Users](guide/users.md) | You are wiring `janus()`, declaring one or several user types, or calling `create`, `update`, `list`, `delete` |
| [Sessions](guide/sessions.md) | You need to know who a request belongs to, set or clear the cookie, renew, sign out, or test expiry |
| [E-mail verification and password reset](guide/email-flows.md) | You are sending a verification or reset link, and handling what comes back |
| [Password hashing](guide/passwords.md) | You are choosing a hasher, raising its cost, moving to argon2id, or importing hashes from another system |

### Permissions — `@nxgt/janus/permissions`

| Page | Read it when |
| --- | --- |
| [Permissions](guide/permissions.md) | You are modelling access with `defineModel`, `fromField` and `when`, and calling `can`, `list`, `grant`, `revoke` |

### Shared by both sides

| Page | Read it when |
| --- | --- |
| [The shared vocabulary](guide/vocabulary.md) | You want the words the documentation uses, or subjects and the tuple notation, ids, cursors, durations or `fixedClock` |
| [Errors](guide/errors.md) | You are turning what the package throws into a status code, and want every code and what it carries |
| [Writing an adapter](guide/adapters.md) | You are implementing the identity stores or the relation store for your database, and running the conformance suites |
| [Troubleshooting](troubleshooting.md) | You have an error message and want its cause and its fix |
| [Roadmap](roadmap.md) | You want to know what is coming, what shipped, and what is deliberately not planned |
