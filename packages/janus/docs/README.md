# @nxgt/janus — documentation

The [README](../README.md) shows that it works; these pages show how, one area
at a time, with an example for every option.

| Page | Read it when |
| --- | --- |
| [Users — `janus()`](guide/users.md) | You are wiring `janus()`, declaring one or several kinds of user, or calling `create`, `update`, `list`, `delete` |
| [Sessions](guide/sessions.md) | You need to know who a request belongs to, set or clear the cookie, renew, sign out, or test expiry |
| [E-mail verification and password reset](guide/email-flows.md) | You are sending a verification or reset link, and handling what comes back |
| [Password hashing](guide/passwords.md) | You are choosing a hasher, raising its cost, moving to argon2id, or importing hashes from another system |
| [Permissions](guide/permissions.md) | You are modelling access with `defineModel`, `fromField` and `when`, and calling `can`, `list`, `grant`, `revoke` |
| [Errors](guide/errors.md) | You are turning what the package throws into a status code, and want every code and what it carries |
| [The shared vocabulary](guide/vocabulary.md) | You need subjects and the tuple notation, ids, cursors, durations or `fixedClock` |
| [Writing an adapter](guide/adapters.md) | You are implementing the store port or the relation store for your database, and running the conformance suites |
| [Troubleshooting](troubleshooting.md) | You have an error message and want its cause and its fix |
| [Roadmap](roadmap.md) | You want to know what is coming, what shipped, and what is deliberately not planned |
