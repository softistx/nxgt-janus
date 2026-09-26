# Errors

This page is for turning what `@nxgt/janus` throws into a response: the error
classes, every code, what each carries, and the one rule behind them. When you
have an error message in hand and want its cause, see
[troubleshooting](../troubleshooting.md).

```ts
import { JanusError, type JanusErrorCode } from '@nxgt/janus';

export function statusOf(code: JanusErrorCode): number {
	switch (code) {
		case 'STORE_FAILED':
			return 503;
		case 'NOT_FOUND':
			return 404;
		case 'LOGIN_TAKEN':
		case 'VERSION_CONFLICT':
			return 409;
		case 'USER_INVALID':
		case 'PASSWORD_TOO_SHORT':
		case 'HASH_UNSUPPORTED':
		case 'INVALID_CURSOR':
		case 'TOKEN_UNKNOWN':
		case 'TOKEN_SPENT':
		case 'TOKEN_EXPIRED':
		case 'TOKEN_STALE':
			return 400;
		case 'CREDENTIALS_INVALID':
		case 'CODE_INVALID':
			return 401;
		case 'SECOND_FACTOR_NOT_ENROLLED':
		case 'SECOND_FACTOR_ACTIVE':
			return 409;
		case 'USER_INACTIVE':
			return 403;
		case 'UNSUPPORTED':
			return 501;
		case 'PERMISSION_DEPTH':
			return 500;
	}
}

export function toResponse(error: unknown): Response {
	if (!(error instanceof JanusError)) throw error;
	const body = error.code === 'CODE_INVALID' ? { code: error.code, attemptsLeft: error.attemptsLeft } : { code: error.code };
	return Response.json(body, { status: statusOf(error.code) });
}
```

`JanusErrorCode` is a union of nineteen string literals, so that `switch` is
exhaustive: when a code is added, a function like `statusOf` stops compiling
instead of answering `undefined`.

## The one rule

**An absence is `null`. A failure throws.** A call that can find nothing
answers `null`, `false` or an empty page. A store that cannot answer — a
refused connection, a timeout, a primary stepping down, a bug in the adapter —
rejects with `STORE_FAILED`. Answer 503. Mapping it to a 404, to `null` or to
`false` turns an outage into a silent lockout: every user is
told they do not exist.

## Two kinds of refusal

| Thrown | When | Class |
| --- | --- | --- |
| At **call** time, on a value that could have come from a request | a taken login, a wrong password, a spent token, an outage | a `JanusError` subclass, with a `code` |
| At **wiring** time, from how you called the library | a lifespan that is not a duration, a store missing a method, a model with a loop, a malformed tuple string, a sealing key removed while secrets sealed with it are stored, a user with an active second factor signing in through a `janus()` given no `secondFactor` | a bare `TypeError` |

No request handler should ever answer a `TypeError` — it is a bug in the code
that wired the library, so no handler needs to tell it apart.

## The codes

| Code | Class | Status | When | Carries |
| --- | --- | --- | --- | --- |
| `STORE_FAILED` | `StoreFailure` | 503 | A store could not answer. **Never a negative answer** | `slot`, `operation`, `cause` |
| `NOT_FOUND` | `NotFoundError` | 404 | `get`, `getUser`, or a write to a user who is gone. `find*` answers `null` instead | `userId` |
| `LOGIN_TAKEN` | `StoreConflict` (`on: 'login'`) | 409 | Another user of the same type holds the login | `login`, `userType` |
| `VERSION_CONFLICT` | `StoreConflict` (`on: 'version'`) | 409 | `ifVersion` no longer matches; nothing was written | `expectedVersion`, `actualVersion` |
| `USER_INVALID` | `UserInvalidError` | 400 | The fields failed the schema | `issues`, field by field |
| `PASSWORD_TOO_SHORT` | `CredentialError` | 400 | Below `password.minLength` | `minLength` — never the password |
| `CREDENTIALS_INVALID` | `CredentialError` | 401 | Unknown login, no password, or the wrong one — **one code for the three** | `reason`, for your logs only |
| `HASH_UNSUPPORTED` | `CredentialError` | 400 | A stored hash no wired hasher reads | `hashPrefix` — never the hash |
| `USER_INACTIVE` | `UserInactiveError` | 403 | Deactivated; told only to someone who gave the right password | `userId` |
| `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`, `TOKEN_STALE` | `TokenError` | 400 | See [e-mail flows](email-flows.md#what-a-token-refusal-means). For a second factor's challenge: sign in again | |
| `CODE_INVALID` | `TokenError` | 401 | A second factor's code that does not match, or was already accepted — see [the second factor](second-factor.md#confirming-the-code-at-sign-in) | `attemptsLeft` from `confirm`: what the challenge has left, `0` once it is spent. None from `activate` |
| `SECOND_FACTOR_NOT_ENROLLED` | `SecondFactorError` | 409 | `activate` before `enroll`, or `confirm` after the factor was disabled | `userId` |
| `SECOND_FACTOR_ACTIVE` | `SecondFactorError` | 409 | `enroll` or `activate` on a factor already active: `disable` it first | `userId` |
| `INVALID_CURSOR` | `InvalidCursorError` | 400 | A cursor this store did not mint. Never a silent first page | |
| `UNSUPPORTED` | `UnsupportedError` | 501 | The wired store lacks an optional capability — `collectExpired` without `deleteExpiredSessions` | `slot`, `operation` |
| `PERMISSION_DEPTH` | `PermissionDepthError` | 500 | A check or list walked past `maxDepth`. **Not a denial** | `permission`, `maxDepth` |

Every class extends `JanusError`, which extends `Error`, so no `catch` block
needs ordering. Every field listed above is on `JanusError` itself, `undefined`
when it does not apply.

## Handling the ones that need care

```ts
import { CredentialError, JanusError, StoreFailure } from '@nxgt/janus';

async function signIn(email: string, password: string): Promise<Response> {
	try {
		const { token } = await auth.signIn({ email, password });
		return Response.json({ token });
	} catch (error) {
		if (error instanceof CredentialError && error.code === 'CREDENTIALS_INVALID') {
			console.warn('sign-in refused', error.reason); // 'unknownLogin' | 'noPassword' | 'wrongPassword'
			return Response.json({ error: 'invalid' }, { status: 401 });
		}
		if (error instanceof StoreFailure) return new Response(null, { status: 503 });
		throw error;
	}
}
```

- **Never put `reason` in a response body.** `unknownLogin` tells an attacker
  which users exist.
- **`STORE_FAILED` is never a 401 or a 404.** Test for it before anything that
  would read as "no".
- **`VERSION_CONFLICT` is a retry**: read the user again, reapply, write with
  the new `version`.
- **`CODE_INVALID`'s `attemptsLeft`** belongs in the body — the form can say
  how many tries are left. `0` means the challenge is spent: send the visitor
  back to the password.
- **`USER_INVALID`'s `issues`** have the schema's own paths
  (`['address', 'city']`), so a form can show each next to its field.

## No message holds a secret

Not a password, not a hash, not a session token, not a token's hash, not a
challenge, a second factor's code or its secret, and not a connection URI — a
connection string holds a password. Nor a login: a message
reports a shape, never a value, so `LOGIN_TAKEN` carries the login in
`error.login` and not in its message. A message names the
call you wrote (`signIn`, `users.findUser`) so you know where to look.

## For adapter authors

`StoreFailure` and `StoreConflict` are exported **because an adapter throws
them**. An adapter defines no error class of its own, so `instanceof` holds
across the two packages:

```ts
import { StoreConflict, StoreFailure } from '@nxgt/janus';

throw new StoreFailure('users.findUser: the store could not answer', { slot: 'users', operation: 'findUser', cause });
throw new StoreConflict('login', 'users.insertUser: the login is taken', { login, userType: 'user' });
throw new StoreConflict('version', 'users.updateUser: the version moved', { expectedVersion: 3, actualVersion: 4 });
```

See [Writing an adapter](adapters.md).

## See also

- [Troubleshooting](../troubleshooting.md) — by the message you see
- [Users](users.md) and [Sessions](sessions.md) — which method rejects with what
