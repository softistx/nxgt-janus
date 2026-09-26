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
| [Signing in with an e-mailed code](guide/sign-in-code.md) | You are signing users in with a six-digit code sent by e-mail — with no password, or beside one: requesting it without telling who exists, keeping the challenge, the attempts and the errors |
| [The second factor](guide/second-factor.md) | You are turning on TOTP codes: making and rotating the sealing keys, the QR code, `signIn`'s `status`, confirming a challenge, disabling |
| [User events](guide/events.md) | You want to hear when a user is created, verifies their e-mail, resets their password or is deleted — to queue it, sync it, or send it as a webhook |
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
| [Writing an adapter](guide/adapters.md) | You are implementing the identity stores or the relation store for your database, upgrading one for `countAttempt`, `spendUserTokens` and the second factor, or running the conformance suites |
| [Troubleshooting](troubleshooting.md) | You have an error message and want its cause and its fix |
| [Roadmap](roadmap.md) | You want to know what is coming, what shipped, and what is deliberately not planned |
