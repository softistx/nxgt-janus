# Signing in with an e-mailed code

This page is for signing a user in with a six-digit code sent to their
e-mail: no password needed, and the code proves the address. `janus` issues
and checks the code; **sending the e-mail is yours**.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

async function sendMail(to: string, subject: string, text: string): Promise<void> {
	// your mailer
}

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const issued = await auth.signInCode.request('ada@example.com'); // IssuedCode | null
if (issued !== null) {
	await sendMail(issued.email, 'Your sign-in code', `${issued.code} signs you in. It expires in 10 minutes.`);

	// keep issued.challenge with the visitor; on their next request, with the code they typed:
	const signedIn = await auth.signInCode.confirm(issued.challenge, issued.code);
	signedIn.token; // a session, as signIn opens one
	signedIn.user.emailVerified; // true: the code reached the inbox
}
```

A sign-in by code is two requests: one asks for a code and answers the same
page whoever asked, the other takes the code and opens the session. The
words — **one-time code**, **challenge**, **attempt** — are defined in
[the vocabulary](vocabulary.md#identities).

## Which types have it

`signInCode` exists on every user type with an e-mail — the field `email`
names, or a required string field called `email` — **with or without a
password**. A type with no e-mail has no `signInCode`: it is absent from its
type, not failing at run time.

```ts
const clinic = janus({
	users: {
		patient: { schema: z.object({ email: z.email() }), password: { login: 'email' } },
		staff: { schema: z.object({ username: z.string() }), password: { login: 'username' } },
		guest: { schema: z.object({ email: z.email() }) }, // no password: signs in by code only
	},
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

clinic.patient.signInCode.request; // exists
clinic.guest.signInCode.request;   // exists: see Passwordless types, below
// @ts-expect-error — staff have no e-mail to send a code to
clinic.staff.signInCode;
```

## Requesting a code

```ts
const issued = await auth.signInCode.request(email);
```

`request` looks up the user of this type holding that e-mail — trimmed and
lowercased first, so `'  ADA@example.com '` finds `ada@example.com` — and
issues a code for them:

```ts
interface IssuedCode<U> {
	readonly code: string;      // six digits, '042817': for the e-mail, and nowhere else
	readonly challenge: string; // the secret the code is checked against: for the visitor, never the e-mail
	readonly email: string;     // the address to send the code to, as the user's field holds it
	readonly expiresAt: Date;   // ten minutes from now, by default
	readonly user: U;
}
```

It answers **`null`** when nobody of this type holds that e-mail, when the
user is inactive, and when the value matches a login that only looks like an
e-mail — a username `ada@example.com` on a type whose e-mail is another
field. Nothing is issued, nothing is written.

**Never tell the visitor which.** Answer the same page, with the same
headers, whether `request` issued a code or not — "if an account uses that
address, we sent it a code". A different status, body or cookie is an
account-enumeration oracle: it tells anyone who types an address whether it
has an account. When the challenge travels in a cookie, set one on the
`null` path too, with a random value of the same shape, so the headers match
— confirming it is `TOKEN_UNKNOWN`, like any wrong challenge:

```ts
import { randomBytes } from 'node:crypto';

const issued = await auth.signInCode.request(email);
// 32 random bytes, base64url — the shape of a real challenge, which nothing will ever accept
const challenge = issued?.challenge ?? randomBytes(32).toString('base64url');
```

The decoy makes **the request** answer the same; **the confirmation** still
tells, if it answers each refusal as it comes. Anyone can ask a code for an
address, then send a wrong one: a decoy's challenge is `TOKEN_UNKNOWN`, a
real one's is `CODE_INVALID` with `attemptsLeft`. When the addresses of your
users must stay secret, answer every refusal of the code route alike, and
give up `attemptsLeft`:

```ts
import { JanusError } from '@nxgt/janus';

try {
	const signedIn = await auth.signInCode.confirm(challenge, code);
	// … set the session cookie, as below
} catch (error) {
	if (error instanceof JanusError && error.code !== 'STORE_FAILED') {
		// one answer for a wrong code, a spent or unknown challenge — a decoy's included
		return Response.json({ code: 'CODE_INVALID' }, { status: 401 });
	}
	throw error; // STORE_FAILED: your 503
}
```

Send the e-mail **after** answering, from a queue or a promise you do not
await: a request that sends an e-mail takes longer than one that does not,
and the time the answer takes would tell what its body does not. The store's
own latency — one write for a code issued, none for `null` — still tells a
patient observer; that limit is stated rather than denied.

Every `request` issues a **new** code with its own challenge; the earlier
ones stay valid until they are confirmed or expire. `janus` does not limit
how often a code is asked for: **rate-limit the request route** per address
and per client, as you would a password reset, or anyone can fill a user's
inbox.

## Sending the code by e-mail

Put **the code, and only the code**, in the e-mail — with its lifetime, so
the visitor knows how long they have:

```ts
if (issued !== null) {
	const minutes = Math.round((issued.expiresAt.getTime() - Date.now()) / 60_000);
	void sendMail(
		issued.email,
		'Your sign-in code',
		`Your code is ${issued.code}. It expires in ${minutes} minutes.\n` +
			'If you did not ask for it, ignore this e-mail: nobody can sign in without it.',
	);
}
```

**No link, and no challenge.** A link carrying the challenge would put it in
the mailbox beside the code — whoever reads the e-mail would hold both
halves — and in every server log and proxy the link crosses. A sign-in link
is not this flow: the code is typed into the page that asked for it, so the
sign-in completes in the browser that started it.

Send it to `issued.email`, not to what the visitor typed: it is the address
the user's field holds, as they registered it.

## Keeping the challenge with the visitor

**The challenge is a secret.** The code alone signs nobody in: it is checked
against the challenge, and only its hash is stored, keyed by the challenge.
Whoever holds the challenge needs only the six digits, so keep it where the
visitor's next request presents it, and nowhere else:

- **a short-lived cookie** — `HttpOnly`, `Secure`, `SameSite=Strict`, a
  `Path` covering only the code route, and a `Max-Age` ending at `expiresAt`;
- or **the body of the code form** — a hidden field of the page that asks
  for the code;
- or, for a bearer client, the body of the answer, which it sends back with
  the code.

**Never in the e-mail, never in a URL** — a query string reaches server logs,
proxies, the browser's history and the `Referer` header — **and never in a
log**. Log the user's id if you need to. The challenge is stored only as its
hash, like a session token, so the store cannot give it back either.

A challenge belongs to the user type that issued it: confirm a patient's
challenge with `clinic.patient.signInCode.confirm`. Another type's `confirm`
answers `TOKEN_UNKNOWN`, and leaves the challenge for its own.

## Confirming the code

```ts
const signedIn = await auth.signInCode.confirm(challenge, code);
// { status: 'signedIn', user, session, token }: the session is open
```

`confirm` checks the code against its challenge, spends the challenge, marks
the user's e-mail verified — the code reached the inbox — and opens a
session: the same `SignedIn` that `signIn` answers.

### Attempts

A challenge takes **five attempts**. Every call to `confirm` counts one, in
one write to the store, **before the code is compared** — a code that is not
six digits, a code that races another: each costs an attempt. `attemptsLeft`
counts down `4, 3, 2, 1, 0`; the fifth wrong code spends the challenge, and
the next call is `TOKEN_SPENT`, even with the right code.

```ts
import { TokenError } from '@nxgt/janus';

try {
	await auth.signInCode.confirm(challenge, code);
} catch (error) {
	if (error instanceof TokenError && error.code === 'CODE_INVALID') {
		error.attemptsLeft; // 4 after the first wrong code; 0 once the challenge is spent
	}
	throw error;
}
```

Five attempts at a million values is a one-in-200,000 chance per challenge.
Codes sent at once past the fifth attempt are all refused, the right one
included: the store counts, and nothing reads the count before writing it.
A new challenge takes a new `request` and a new e-mail — which is why that
route is the one to rate-limit.

### Lifetime

A challenge lives **ten minutes** unless `tokens.signInCode` says otherwise,
and is `TOKEN_EXPIRED` after that. Ten minutes is time for an e-mail to
arrive and be read; a longer window is a longer life for a stolen challenge.

```ts
janus({ ..., tokens: { signInCode: '15m' } });
```

### The e-mail is verified

A user whose `emailVerified` was `false` has it `true` once `confirm`
succeeds, and their `version` moves: the code proves the address as a
verification link would. A user already verified is not written.

### A second factor is still asked for

The code proves the e-mail, not the second factor. With `janus({ secondFactor })`,
a user whose factor is active gets **no session from the code**: `confirm`
answers a challenge, exactly as `signIn` does with a password, and
[`secondFactor.confirm`](second-factor.md#confirming-the-code-at-sign-in)
redeems it with the code of their authenticator app.

```ts
const result = await auth.signInCode.confirm(challenge, code);
switch (result.status) {
	case 'signedIn':
		// result.token, result.session: set the cookie
		break;
	case 'secondFactor':
		// result.challenge: a new challenge, for secondFactor.confirm — keep it as you kept this one
		break;
}
```

`confirm` answers `SignInResult` on a type whose `signIn` does — a type with
a password, in an instance given a `secondFactor` — and reading `token`
before narrowing on `status` is a compile error there. Anywhere else it
answers `SignedIn`.

### What `confirm` refuses

| Rejects with | When | What to do |
| --- | --- | --- |
| `CODE_INVALID`, with `attemptsLeft` | the code does not match, or is not six digits. Message: `signInCode.confirm: the code does not match, or was already used` | ask again while `attemptsLeft > 0`; at `0` the challenge is spent: request a new code |
| `TOKEN_UNKNOWN` | no such challenge — a typo, another user type's, one whose user was deleted, or one a store's TTL already dropped | request a new code |
| `TOKEN_SPENT` | the challenge already signed someone in, or its attempts ran out | request a new code |
| `TOKEN_EXPIRED` | `expiresAt` has passed | request a new code |
| `TOKEN_STALE` | the user changed their e-mail since the code was sent. Message: `signInCode.confirm: the code was sent to an e-mail the user no longer has`. The challenge is spent | request a new code, to the current address |
| `USER_INACTIVE` | the user was deactivated since the code was sent. The challenge is spent | answer 403 |
| `VERSION_CONFLICT` | rare: another write to the user landed while `confirm` marked the e-mail verified. The challenge is spent | request a new code |

Every refusal is a `TokenError` but `USER_INACTIVE`, a `UserInactiveError`;
with several user types the message starts with the type:
`patient.signInCode.confirm: …`. The `TOKEN_*` messages name the challenge —
`no such challenge`, `the challenge was already used`, `the challenge has
expired`. Every call may also reject with `STORE_FAILED`: your 503, never a
401. [Troubleshooting](../troubleshooting.md#sign-in-codes) has each message
with its cause.

## Passwordless types

A user type with an e-mail and **no `password`** signs in by code alone.
Create its users with `create` — `signUp` and `signIn` need a password, and
do not exist on it:

```ts
import { z } from 'zod';
import { createMemoryStores, janus } from '@nxgt/janus';

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	store: createMemoryStores(), // no password: no hasher needed
});

await auth.create({ email: 'ada@example.com', name: 'Ada' });

const issued = await auth.signInCode.request('ada@example.com');
if (issued !== null) {
	const signedIn = await auth.signInCode.confirm(issued.challenge, issued.code);
	signedIn.user.hasPassword; // false
}
```

A passwordless type has no second factor either, so its `confirm` always
answers `SignedIn`, even in an instance given a `secondFactor`:

```ts
const clinic = janus({
	users: {
		patient: { schema: z.object({ email: z.email() }), password: { login: 'email' } },
		guest: { schema: z.object({ email: z.email() }) },
	},
	store: createMemoryStores(),
	hasher: scryptHasher(),
	secondFactor: { issuer: 'Clinic', keys: [{ id: '2026-09', key: process.env.TOTP_KEY ?? '' }] },
});

const guest = await clinic.guest.signInCode.confirm(challenge, code);
guest.token; // SignedIn: no status to narrow
const patient = await clinic.patient.signInCode.confirm(challenge, code);
if (patient.status === 'signedIn') patient.token; // SignInResult: narrow first
```

A user of a type **with** a password can sign in by code too, whether or not
they ever set one: `create` a user with no password, and the code is how
they get in until `setPassword`.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `tokens.signInCode` | `Duration` | `'10m'` | How long a challenge — and so its code — can be confirmed |
| `email` | a field name | `'email'` | The field the code is sent to, and looked up by, per type |

```ts
janus({
	user: z.object({ contact: z.email() }),
	email: 'contact', // request() looks up, and answers, this field
	store: createMemoryStores(),
	tokens: { signInCode: '5m' },
});
```

A `tokens.signInCode` that is not a duration is refused when `janus()` is
called, with a `TypeError`: `janus: tokens.signInCode: "<value>" is not a
duration; …`. The code is always six digits and a challenge always takes
five attempts; neither is configurable.

## As routes

A fetch-style pair of handlers — the shape Bun and most frameworks hand
you. The challenge travels in a cookie scoped to the code route;
[`@nxgt/janus-hono`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-hono/docs/guide/routes.md#a-code-sent-by-e-mail)
has the same in Hono.

```ts
import { randomBytes } from 'node:crypto';
import { JanusError, TokenError } from '@nxgt/janus';

const CHALLENGE = 'sign-in-code';
const scope = 'Path=/sign-in/email; HttpOnly; Secure; SameSite=Strict';

export async function requestCode(request: Request): Promise<Response> {
	const { email } = (await request.json()) as { email: string };
	const issued = await auth.signInCode.request(email);
	if (issued !== null) {
		void sendMail(issued.email, 'Your sign-in code', `Your code is ${issued.code}.`); // not awaited
	}
	// the same answer either way: a decoy challenge when nobody holds the e-mail
	const challenge = issued?.challenge ?? randomBytes(32).toString('base64url');
	return Response.json(
		{ next: 'code' },
		{ status: 202, headers: { 'Set-Cookie': `${CHALLENGE}=${challenge}; Max-Age=600; ${scope}` } },
	);
}

export async function confirmCode(request: Request): Promise<Response> {
	const { code } = (await request.json()) as { code: string };
	const challenge = request.headers
		.get('cookie')
		?.match(new RegExp(`(?:^|;\\s*)${CHALLENGE}=([^;]+)`))?.[1];
	if (challenge === undefined) return Response.json({ code: 'TOKEN_UNKNOWN' }, { status: 400 });

	try {
		const signedIn = await auth.signInCode.confirm(challenge, code);
		const headers = new Headers();
		headers.append('Set-Cookie', auth.cookie.serialize(signedIn.token, signedIn.session));
		headers.append('Set-Cookie', `${CHALLENGE}=; Max-Age=0; ${scope}`);
		return Response.json({ id: signedIn.user.id }, { headers });
	} catch (error) {
		if (error instanceof TokenError && error.code === 'CODE_INVALID') {
			return Response.json({ code: error.code, attemptsLeft: error.attemptsLeft }, { status: 401 });
		}
		if (error instanceof JanusError && error.code === 'USER_INACTIVE') {
			return Response.json({ code: error.code }, { status: 403 });
		}
		if (error instanceof JanusError && error.code !== 'STORE_FAILED') {
			return Response.json({ code: error.code }, { status: 400 }); // TOKEN_*: request a new code
		}
		throw error; // STORE_FAILED: your 503
	}
}
```

`Max-Age=600` is the default ten minutes, written out so the decoy and the
real cookie are the same header; derive it from `tokens.signInCode` if you
change that. A wrong code leaves the cookie in place, so the visitor types
it again. These routes answer `attemptsLeft`, so the code route tells a
decoy from a real challenge; where that matters, use
[one answer for every refusal](#requesting-a-code) instead. With a `secondFactor` configured, narrow `confirm`'s answer on
`status` before reading `token`, and hand the new challenge on to
[the second factor's route](second-factor.md#a-sign-in-with-a-code-as-routes).

## In a test

No mailbox needed: `request` answers the code it would have sent.

```ts
import { expect, it } from 'bun:test';
import { z } from 'zod';
import { createMemoryStores, fixedClock, janus } from '@nxgt/janus';

it('signs in with the e-mailed code, and not after ten minutes', async () => {
	const clock = fixedClock(Date.UTC(2026, 0, 1));
	const auth = janus({ user: z.object({ email: z.email() }), store: createMemoryStores(), clock });
	await auth.create({ email: 'ada@example.com' });

	const issued = await auth.signInCode.request('ada@example.com');
	if (issued === null) throw new Error('expected a code');
	expect((await auth.signInCode.confirm(issued.challenge, issued.code)).user.emailVerified).toBe(true);

	const late = await auth.signInCode.request('ada@example.com');
	if (late === null) throw new Error('expected a code');
	clock.advance(10 * 60_000);
	await expect(auth.signInCode.confirm(late.challenge, late.code)).rejects.toMatchObject({
		code: 'TOKEN_EXPIRED',
	});
});
```

## Signatures

```ts
interface SignInCodeApi<U, Answer = SignedIn<U>> {
	readonly signInCode: {
		request(email: string): Promise<IssuedCode<U> | null>;
		confirm(challenge: string, code: string): Promise<Answer>;
	};
}
```

`Answer` is `SignInResult<U>` on a type with a password in an instance given
a `secondFactor`, and `SignedIn<U>` everywhere else. `IssuedCode` and
`SignInCodeApi` are exported from `@nxgt/janus`, as types.

## See also

- [The second factor](second-factor.md) — the challenge `confirm` answers for a user whose factor is active
- [E-mail verification and password reset](email-flows.md) — the other flows that send an e-mail, and `TOKEN_STALE`
- [Sessions](sessions.md) — the cookie the session is sent in
- [Errors](errors.md) — every code and its status
- [`@nxgt/janus-telemetry`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-telemetry/docs/guide/tracing.md#a-code-sent-by-e-mail) — the events a sign-in by code writes
- [Troubleshooting](../troubleshooting.md#sign-in-codes) — by the message you see
