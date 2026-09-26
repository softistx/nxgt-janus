# The second factor

This page is for turning on a TOTP second factor — the six-digit codes of an
authenticator app — and wiring its four flows: enroll, activate, confirm at
sign-in, disable.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	secondFactor: {
		issuer: 'Example', // shown in the authenticator app beside the account
		keys: [{ id: '2026-09', key: process.env.TOTP_KEY ?? '' }], // openssl rand -base64 32; unset, janus() refuses
	},
});

const { user } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
const { uri } = await auth.secondFactor.enroll(user); // render uri as a QR code
await auth.secondFactor.activate(user, '123456');      // the first code the app shows

const result = await auth.signIn({ email: 'ada@example.com', password: 'correct horse' });
if (result.status === 'secondFactor') {
	// no session yet: ask for a code, then
	const signedIn = await auth.secondFactor.confirm(result.challenge, '654321');
}
```

The words — **enrolled**, **active**, **challenge**, **attempt**, **step**,
**seal** — are defined in [the vocabulary](vocabulary.md#identities).

## Configuration

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `secondFactor.issuer` | string | — required | Your product's name. The authenticator app shows it beside the account, and it is the first half of the QR code's label |
| `secondFactor.keys` | `[SealingKey, ...SealingKey[]]` | — required | The **sealing keys**. Every TOTP secret is sealed with the first before a store sees it; every key opens. See [Rotating the keys](#rotating-the-keys) |
| `secondFactor.challenge` | `Duration` | `'5m'` | How long the challenge `signIn` answers waits for a code |

```ts
interface SecondFactorConfig {
	readonly issuer: string;
	readonly keys: readonly [SealingKey, ...SealingKey[]];
	readonly challenge?: Duration;
}

interface SealingKey {
	readonly id: string;  // letters, digits, _ and -, at most 64: written into every secret it seals
	readonly key: string; // 32 random bytes, in base64 or base64url
}
```

### Making a key

```sh
openssl rand -base64 32
```

That prints 44 characters: 32 random bytes in base64, which is what `key`
takes. Keep it where your other secrets are — an environment variable, a
secret manager — and **never in the database it protects**: a dump that holds
the key holds every secret it sealed.

```ts
import type { SealingKey } from '@nxgt/janus';

function sealingKey(id: string, variable: string): SealingKey {
	const key = process.env[variable];
	if (key === undefined) throw new Error(`${variable} is not set`);
	return { id, key };
}

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store,
	hasher: scryptHasher(),
	secondFactor: {
		issuer: 'Example',
		keys: [sealingKey('2026-09', 'TOTP_KEY_2026_09')],
		challenge: '3m',
	},
});
```

Name a key after when it was made, and never give two keys the same `id`: the
id is written into every secret the key seals, and it is how the right key is
found to open it.

### What `janus()` refuses

A configuration that cannot seal is refused when `janus()` is called, with a
bare `TypeError` — a wiring mistake, never an answer to a request:

| Message | Cause |
| --- | --- |
| `janus: secondFactor.issuer must name your application — the authenticator app shows it beside the account` | `issuer` missing or blank |
| `janus: secondFactor.keys: expected at least one key — [{ id, key }], the first seals` | `keys` missing or empty |
| `janus: secondFactor.keys: every key needs an id of letters, digits, _ and -, at most 64 of them` | an `id` with a `.`, a space, or over 64 characters |
| `janus: secondFactor.keys: two keys have the id "<id>"` | a repeated `id` |
| `janus: secondFactor.keys: the key "<id>" is not 32 bytes in base64 — make one with openssl rand -base64 32` | a key of another length, or not base64 |
| `janus: secondFactor.challenge: …` | a `challenge` that is not a duration |

### What turning it on changes

- **`signIn` answers `SignInResult`**, a union you switch on `status` — see
  [Signing in](#signing-in-switch-on-status). This is the one change that
  breaks a caller: `const { token } = await auth.signIn(…)` no longer
  compiles.
- **`secondFactor` exists on every user type with a password** —
  `auth.secondFactor` with one type, `clinic.staff.secondFactor` with several.
  A type with no password signs nobody in, so it has none; neither does an
  instance given no `secondFactor`. Both are compile errors.
- **Every user carries `hasSecondFactor`**: `true` once the factor is active.
  A schema may not declare that field.

Without `secondFactor`, `signIn` answers a session as before, typed
`SignedIn`, which now carries `status: 'signedIn'` too.

## The states of a factor

| State | `hasSecondFactor` | `signIn` answers | Reached by |
| --- | --- | --- | --- |
| none | `false` | a session | a new user; `disable` |
| **enrolled** — waiting for a first code | `false` | a session | `enroll` |
| **active** | `true` | a challenge | `activate`, with a code that matches |

Only an active factor is asked for. A user who scanned the QR code and never
typed a code signs in with their password alone.

## Enrolling: the QR code

```ts
const { secret, uri } = await auth.secondFactor.enroll(user);
// secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' — base32, for a user who types it in
// uri:    'otpauth://totp/Example:ada%40example.com?secret=…&issuer=Example&algorithm=SHA1&digits=6&period=30'
```

`enroll` mints a secret, seals it onto the user, and answers it once. **Show
both, keep neither**: render `uri` as a QR code — with any QR library, in the
browser or on the server — and show `secret` beside it for a user who cannot
scan. No call answers the secret again. Send the answer with
`Cache-Control: no-store`, so no cache keeps it either.

```ts
interface SecondFactorEnrolment {
	readonly secret: string; // base32
	readonly uri: string;    // otpauth://totp/<issuer>:<login>?…
}
```

The label is `issuer:login` — the login the user signs in with, so the app
shows `Example (ada@example.com)`. The codes are RFC 6238 as every
authenticator app reads them — HMAC-SHA-1, six digits, a thirty-second
**step** — and none of the three is configurable: several apps ignore
`algorithm` and `digits` in the URI, and would show codes the server never
accepts.

| Call | Answers | Rejects with |
| --- | --- | --- |
| `enroll(user)` on a user with no factor | `{ secret, uri }`; the factor is enrolled | |
| `enroll(user)` on an enrolled factor | a new secret: **it replaces the waiting one**, and the last QR code shown is the one that works | |
| `enroll(user)` on an active factor | | `SECOND_FACTOR_ACTIVE` — `disable` it first: enrolling again must not quietly switch it off |

`enroll` takes `{ ifVersion }` like every write.

## Activating: the first code

```ts
const active = await auth.secondFactor.activate(user, code); // the code the app shows now
active.hasSecondFactor; // true: from now on, signIn asks for a code
```

`activate` proves the user's app holds the secret before anything depends on
it. Until it succeeds, the factor waits and `signIn` asks for nothing.

| Rejects with | When |
| --- | --- |
| `CODE_INVALID` | the code does not match, or is not six digits. The factor stays enrolled, and the user tries again. **No `attemptsLeft`**: `activate` is not a challenge, so it counts nothing — rate-limit it as you would any authenticated form |
| `SECOND_FACTOR_NOT_ENROLLED` | `enroll` was never called, or `disable` was called since |
| `SECOND_FACTOR_ACTIVE` | the factor is already active |

A code is accepted once. The one that activated the factor is spent, so the
user's next sign-in waits for the app's next code.

## Signing in: switch on `status`

```ts
type SignInResult<U> = SignedIn<U> | SecondFactorRequired;

interface SignedIn<U> {
	readonly status: 'signedIn';
	readonly user: U;
	readonly session: Session;
	readonly token: string;
}

interface SecondFactorRequired {
	readonly status: 'secondFactor';
	readonly challenge: string; // a secret, like a session token
	readonly expiresAt: Date;   // five minutes from now, by default
	readonly userId: Id;        // for your logs and rate limits — not for the visitor
}
```

A user whose factor is active gets **no session from their password** — nor
from a [code sent by e-mail](sign-in-code.md#a-second-factor-is-still-asked-for),
whose `confirm` answers the same union: they get a **challenge**, which `secondFactor.confirm` redeems with a code. Anyone
else gets a session, as before. `signIn`'s refusals — `CREDENTIALS_INVALID`,
`USER_INACTIVE` — are unchanged, and come before any challenge: a wrong
password never tells anyone that a second factor exists.

```ts
const result = await auth.signIn({ email, password });
switch (result.status) {
	case 'signedIn':
		// result.token, result.session: set the cookie, as before
		break;
	case 'secondFactor':
		// result.challenge: keep it for the next request, and ask for a code
		break;
}
```

### Where to keep the challenge

**The challenge is a secret.** With a password already proved, it is half of
a sign-in: whoever holds it needs only a code. Keep it where the visitor's
next request presents it, and nowhere else:

- **a short-lived cookie** — `HttpOnly`, `Secure`, `SameSite=Strict`, a
  `Path` covering only the code route, and a `Max-Age` ending at `expiresAt`;
- or **the body of your code form** — a hidden field of the page that asks
  for the code;
- or, for a bearer client, the body of the answer, which it sends back with
  the code.

**Never in a URL** — a query string reaches server logs, proxies, the
browser's history and the `Referer` header — **and never in a log**. Log the
user's id if you need to; the challenge is stored only as its hash, like a
session token, so it cannot be recovered from the store either.

A challenge belongs to the user type that issued it: in a multi-type
application, confirm a staff member's challenge with
`clinic.staff.secondFactor.confirm`. Another type's `confirm` answers
`TOKEN_UNKNOWN`.

## Confirming: the code at sign-in

```ts
const signedIn = await auth.secondFactor.confirm(challenge, code);
// { status: 'signedIn', user, session, token }: the session is open
```

`confirm` redeems the challenge with a code and opens the session — the same
`SignedIn` a sign-in without a second factor answers.

| Rejects with | When | What to do |
| --- | --- | --- |
| `CODE_INVALID`, with `attemptsLeft` | the code does not match, is not six digits, or was already accepted | ask again while `attemptsLeft > 0`; at `0` the challenge is spent: sign in again |
| `TOKEN_UNKNOWN` | no such challenge — a typo, another user type's, or one a store's TTL already dropped. Another type's challenge still loses one of its attempts, and its fifth spends it | sign in again |
| `TOKEN_SPENT` | the challenge already opened a session, its attempts ran out, or a password reset spent it | sign in again |
| `TOKEN_EXPIRED` | `expiresAt` has passed | sign in again |
| `USER_INACTIVE` | the user was deactivated since `signIn`. The challenge is spent | answer 403, as `signIn` would |
| `SECOND_FACTOR_NOT_ENROLLED` | the factor was disabled since `signIn`. The challenge is spent | sign in again: the password alone now opens a session |

### Attempts

A challenge takes **five attempts**. Every call to `confirm` counts one, in
one write to the store, **before anything is checked** — a malformed code, a
code that races another: each costs an attempt. `attemptsLeft` counts down
`4, 3, 2, 1, 0`; the fifth wrong code spends the challenge, and the next call
is `TOKEN_SPENT`, even with the right code.

```ts
import { TokenError } from '@nxgt/janus';

try {
	await auth.secondFactor.confirm(challenge, code);
} catch (error) {
	if (error instanceof TokenError && error.code === 'CODE_INVALID') {
		error.attemptsLeft; // 4 after the first wrong code; 0 once the challenge is spent
	}
	throw error;
}
```

Five attempts at a million values is a one-in-200,000 chance per password
guessed right. A new challenge takes a new sign-in, with the password, so the
attempts are bounded by your sign-in rate limit too.

A call made through **another user type's** API — `auth.staff.secondFactor.confirm`
for a patient's challenge — answers `TOKEN_UNKNOWN` and compares nothing, but
its attempt counts all the same: the fifth spends the challenge, as a wrong
code would.

**Writing a password ends the sign-ins left waiting.** `resetPassword.confirm`,
`setPassword` and `changePassword` spend every challenge of the user still
open, so whoever had the old password cannot finish a sign-in they started
with it:

```ts
const result = await auth.signIn({ email, password: oldPassword }); // a challenge
await auth.resetPassword.confirm(resetToken, newPassword);
await auth.secondFactor.confirm(result.challenge, code); // TOKEN_SPENT
```

A sign-in still running when the password is written is refused too.
`signIn` reads the user again once it answered: if the password it verified
is no longer theirs, it spends its own challenge — or revokes the session it
opened — and throws `CREDENTIALS_INVALID`. The writer spends after writing,
the sign-in reads after issuing, so however the two interleave one of them
sees the other. A hash rewritten for the same password — another sign-in
rehashing it — is not a change.

### Lifetime

A challenge lives `'5m'` unless `secondFactor.challenge` says otherwise, and
is `TOKEN_EXPIRED` after that. Five minutes is time to unlock a phone and
open an app; a longer window is a longer life for a stolen challenge.

### Replay

A code is accepted **once**. Each accepted code records its step, and only a
later step counts after that — so a code seen over a shoulder, or replayed
against a new challenge, is `CODE_INVALID`. Of two `confirm` calls with the
same code at the same moment, one opens a session and the other is refused.

The app's code changes every thirty seconds, and the code of the step before
or after the current one is accepted too, for a phone whose clock drifted.

## Disabling

```ts
const user = await auth.secondFactor.disable(current.user);
user.hasSecondFactor; // false: signIn answers a session again
```

`disable` removes the factor, active or enrolled, and answers the user. A
user without one is answered as they are. A challenge issued before is
refused afterwards, with `SECOND_FACTOR_NOT_ENROLLED`.

### Asking before `enroll` and `disable` is your policy

`janus` checks nothing before `enroll` or `disable`: it does not know who is
calling, only which user is meant. **Whether the user must prove themselves
again first is the application's decision** — a support tool may disable a
factor for a user who lost their phone, while a user's own settings page
should not let a stolen session switch it off.

A common rule is a **recent sign-in**: the session was opened a few minutes
ago, so its holder just gave the password — and the code, when the factor is
active. `session.authenticatedAt` is when the session was opened, and renewal
does not move it:

```ts
const RECENT = 5 * 60_000;

export async function disableSecondFactor(request: Request): Promise<Response> {
	const current = await auth.authenticate(request);
	if (current === null) return new Response(null, { status: 401 });
	if (Date.now() - current.session.authenticatedAt.getTime() > RECENT) {
		return Response.json({ error: 'signInAgain' }, { status: 403 });
	}
	await auth.secondFactor.disable(current.user);
	return new Response(null, { status: 204 });
}
```

Use the same check before `enroll`, before `changePassword`, and before
anything else a stolen session should not be able to do.

## Rotating the keys

**The first key seals; every key opens.** A secret names the key that sealed
it (`v1.<key id>.…`), so a rotation is a change of order, not a migration:

1. Make a new key, and add it **last**: every instance can now open what it
   will seal, and none seals with it yet. Deploy that everywhere.

   ```ts
   keys: [sealingKey('2026-09', 'TOTP_KEY_2026_09'), sealingKey('2026-10', 'TOTP_KEY_2026_10')],
   ```

2. Move it **first**, and deploy again. It seals every new secret; the old
   key still opens the others:

   ```ts
   keys: [sealingKey('2026-10', 'TOTP_KEY_2026_10'), sealingKey('2026-09', 'TOTP_KEY_2026_09')],
   ```

   Two deployments, because during a rolling one an instance still on the
   old list would meet a secret sealed with a key it does not hold. With a
   single instance, or one that stops before the next starts, step 1 can be
   skipped.
3. Wait. Every secret sealed under the old key is sealed again under the new
   one **the next time a code is accepted** for it — at `activate` or
   `confirm`. A user who does not sign in keeps the old sealing.
4. Remove the old key only when no secret is sealed with it. Ask your
   database, since the key's id is the second part of the stored secret:

   ```ts
   // MongoDB, with @nxgt/janus-mongo
   await db.collection('users').countDocuments({ 'secondFactor.secret': { $regex: '^v1\\.2026-09\\.' } });
   ```

   ```sql
   -- PostgreSQL, with @nxgt/janus-drizzle
   select count(*) from users where second_factor_secret like 'v1.2026-09.%';
   ```

   Those users have not signed in since the rotation. Wait longer, or
   `disable` their factor and have them enroll again.

A key removed too early, or changed under the same id, is a wiring mistake,
and it surfaces the next time one of those users signs in — as a bare
`TypeError`, a 500, never a `CODE_INVALID` that would blame the user:

```
secondFactor.confirm: the secret is sealed with the key "2026-09", which secondFactor.keys no longer holds — keep a key until no secret is sealed with it
secondFactor.confirm: the secret does not open with the key "2026-09" — was that key changed under the same id, or the secret copied from another user?
```

**What sealing protects.** A secret is sealed with AES-256-GCM, and the
user's id is bound into it: a dump of the users, without the keys, produces
no code, and a sealed secret copied onto another user does not open. It does
not protect a store whose application is compromised — that process holds
the keys.

## Failing closed without keys

A user whose factor is active is **never signed in by a `janus()` given no
`secondFactor`**. The password is right, a code is due, and that instance
cannot check one — so `signIn` throws a bare `TypeError` rather than open a
session on the password alone:

```
signIn: the user's second factor is active, and janus() was given no secondFactor — pass secondFactor: { issuer, keys }
```

This bites an application that builds more than one `janus()` — a web server
and an admin tool, a worker, a script — and gives the keys to one of them.
**Give every instance that signs users in the same `secondFactor`**, built
once:

```ts
// auth.ts: the one configuration every entry point imports
export const secondFactor = {
	issuer: 'Example',
	keys: [sealingKey('2026-10', 'TOTP_KEY_2026_10'), sealingKey('2026-09', 'TOTP_KEY_2026_09')],
} as const;
```

The same holds for `enroll`, `activate` and `confirm`, which an instance with
no keys cannot call — for TypeScript they do not exist on it, and for a
JavaScript caller they throw the same `TypeError`.

## A sign-in with a code, as routes

A fetch-style pair of handlers — the shape Bun and most frameworks hand you.
The challenge travels in a cookie scoped to the sign-in routes;
[`@nxgt/janus-hono`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-hono/docs/guide/routes.md#a-second-factor)
has the same in Hono.

```ts
import { JanusError, TokenError } from '@nxgt/janus';

const CHALLENGE = 'sign-in-challenge';
const scope = 'Path=/sign-in; HttpOnly; Secure; SameSite=Strict';

export async function signIn(request: Request): Promise<Response> {
	const { email, password } = (await request.json()) as { email: string; password: string };
	const result = await auth.signIn({ email, password });

	if (result.status === 'secondFactor') {
		const maxAge = Math.floor((result.expiresAt.getTime() - Date.now()) / 1000);
		return Response.json(
			{ next: 'code' },
			{ headers: { 'Set-Cookie': `${CHALLENGE}=${result.challenge}; Max-Age=${maxAge}; ${scope}` } },
		);
	}
	return Response.json(
		{ id: result.user.id },
		{ headers: { 'Set-Cookie': auth.cookie.serialize(result.token, result.session) } },
	);
}

export async function confirmSecondFactor(request: Request): Promise<Response> {
	const { code } = (await request.json()) as { code: string };
	const challenge = request.headers
		.get('cookie')
		?.match(new RegExp(`(?:^|;\\s*)${CHALLENGE}=([^;]+)`))?.[1];
	if (challenge === undefined) return Response.json({ code: 'TOKEN_UNKNOWN' }, { status: 400 });

	try {
		const signedIn = await auth.secondFactor.confirm(challenge, code);
		const headers = new Headers();
		headers.append('Set-Cookie', auth.cookie.serialize(signedIn.token, signedIn.session));
		headers.append('Set-Cookie', `${CHALLENGE}=; Max-Age=0; ${scope}`);
		return Response.json({ id: signedIn.user.id }, { headers });
	} catch (error) {
		if (error instanceof TokenError && error.code === 'CODE_INVALID') {
			return Response.json({ code: error.code, attemptsLeft: error.attemptsLeft }, { status: 401 });
		}
		if (error instanceof JanusError && error.code !== 'STORE_FAILED') {
			return Response.json({ code: error.code }, { status: 400 }); // sign in again
		}
		throw error; // STORE_FAILED: your 503
	}
}
```

The code route answers `attemptsLeft` so the form can say how many attempts are
left, and nothing else: which of the causes of `CODE_INVALID` it was — a wrong
code, a reused one — is not the visitor's business.

## In a test

The codes come from the secret `enroll` answered and the clock — pass
`fixedClock` to `janus()`, and compute them as an authenticator app does:

```ts
import { createHmac } from 'node:crypto';
import { expect, it } from 'bun:test';
import { z } from 'zod';
import { createMemoryStores, fixedClock, janus, scryptHasher } from '@nxgt/janus';

/** The code an authenticator app shows at `at`: RFC 6238, SHA-1, six digits, thirty seconds. */
function totp(base32: string, at: Date): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const char of base32) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
	const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 30_000)));
	const digest = createHmac('sha1', key).update(counter).digest();
	const offset = (digest[19] as number) & 0x0f;
	return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

it('asks for a code once the factor is active', async () => {
	const clock = fixedClock(Date.UTC(2026, 0, 1));
	const auth = janus({
		user: z.object({ email: z.email() }),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }), // fast in tests; keep the default in production
		clock,
		secondFactor: {
			issuer: 'Test',
			keys: [{ id: 'test', key: Buffer.alloc(32, 1).toString('base64') }],
		},
	});
	const credentials = { email: 'ada@example.com', password: 'correct horse' };
	const { user } = await auth.signUp(credentials);
	const { secret } = await auth.secondFactor.enroll(user);
	await auth.secondFactor.activate(user, totp(secret, clock.now()));
	clock.advance(30_000); // activation spent this step's code

	const result = await auth.signIn(credentials);
	if (result.status !== 'secondFactor') throw new Error('expected a challenge');
	const signedIn = await auth.secondFactor.confirm(result.challenge, totp(secret, clock.now()));

	expect(signedIn.user.hasSecondFactor).toBe(true);
});
```

## Signatures

```ts
interface SecondFactorApi<U> {
	readonly secondFactor: {
		enroll(user: UserRef, options?: WriteOptions): Promise<SecondFactorEnrolment>;
		activate(user: UserRef, code: string, options?: WriteOptions): Promise<U>;
		disable(user: UserRef, options?: WriteOptions): Promise<U>;
		confirm(challenge: string, code: string): Promise<SignedIn<U>>;
	};
}
```

`UserRef` is a user or its id; `WriteOptions` is `{ ifVersion? }`, as on
every write — see [Users](users.md#ifversion). Every call may also reject
with `STORE_FAILED`.

## See also

- [Sign-in codes](sign-in-code.md) — a sign-in by e-mailed code, which still asks for an active factor, with the same challenge
- [Sessions](sessions.md) — the cookie `confirm`'s session is sent in, and `authenticatedAt`
- [Errors](errors.md) — `CODE_INVALID`, `SECOND_FACTOR_NOT_ENROLLED`, `SECOND_FACTOR_ACTIVE` and their statuses
- [Writing an adapter](adapters.md#a-users-password-and-second-factor) — what a store keeps of a factor
- [`@nxgt/janus-telemetry`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-telemetry/docs/guide/tracing.md) — the events a second factor writes
- [Troubleshooting](../troubleshooting.md) — by the message you see
