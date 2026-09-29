# Devices — a sign-in from a new device

This page is for telling a user when their account is signed in from a
device they had not signed in from: wiring `devices`, giving each sign-in the
**device token** the client holds, keeping it in a cookie, and sending the
notice.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	devices: { keys: [{ id: '2026-09', key: process.env.DEVICES_KEY ?? '' }] }, // openssl rand -base64 32
});

const credentials = { email: 'ada@example.com', password: 'correct horse' };

const signedUp = await auth.signUp(credentials, { device: null }); // no token yet
signedUp.deviceToken; // 'd1.2026-09.…' — keep it in a long-lived cookie
signedUp.newDevice; // false: a sign-up is never new

const again = await auth.signIn(credentials, { device: signedUp.deviceToken });
again.newDevice; // false: the device Ada signed up on

const elsewhere = await auth.signIn(credentials, { device: null }); // a browser with no cookie
elsewhere.newDevice; // true — and the event user.newDeviceSignedIn was sent
elsewhere.deviceToken; // a fresh token, for that browser's cookie
```

**Nothing is stored.** A device token is a random device id and a keyed hash
binding it to the user: the client keeps it, and it proves "this user signed
in on this device before" on its own. The store ports are unchanged, and no
adapter needs a migration. The words — **device**, **device token** — are
defined in [the vocabulary](vocabulary.md#identities).

## Wiring

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `devices.keys` | `[SealingKey, ...SealingKey[]]` | — required once `devices` is given | The keys device tokens are signed with. **The first signs, every one checks.** See [Rotating the keys](#rotating-the-keys-and-forgetting-devices) |

Without `devices`, no sign-in may be given a `device`: every answer's
`newDevice` is `false`, its `deviceToken` `null`, and no
`user.newDeviceSignedIn` is sent.

```ts
interface DevicesConfig {
	readonly keys: readonly [SealingKey, ...SealingKey[]];
}

interface SealingKey {
	readonly id: string;  // letters, digits, _ and -, at most 64: written into every token it signs
	readonly key: string; // 32 random bytes, in base64 or base64url
}
```

The keys have the format of [`secondFactor.keys`](second-factor.md#making-a-key),
and are made the same way:

```sh
openssl rand -base64 32
```

Use a key of its own rather than a sealing key of the second factor's: the
two rotate for different reasons. Keep it where your other secrets are, and
give **every `janus()` that signs users in the same `devices`** — a token
signed by an instance whose keys another does not hold is a new device there.

`janus()` refuses a configuration it cannot sign with, with a bare
`TypeError`:

| Message | Cause |
| --- | --- |
| `janus: devices.keys: expected at least one key — [{ id, key }], the first seals` | `keys` missing or empty |
| `janus: devices.keys: every key needs an id of letters, digits, _ and -, at most 64 of them` | an `id` with a `.`, a space, or over 64 characters |
| `janus: devices.keys: two keys have the id "<id>"` | a repeated `id` |
| `janus: devices.keys: the key "<id>" is not 32 bytes in base64 — make one with openssl rand -base64 32` | a key of another length, or not base64 — an environment variable that is not set, say |

`devices: { keys: [] }` is also a compile error.

## Giving a sign-in the device

Every call that opens a session takes `{ device }` as its last argument, a
`SignInOptions`:

| Call | Given a device |
| --- | --- |
| `signUp(input, { device })` | mints the user's first token: `newDevice` is always `false`, and no event is sent — the device they signed up on is known from the start |
| `signIn(input, { device })` | answers `newDevice` and `deviceToken`; a new device sends `user.newDeviceSignedIn`. With an active second factor, the challenge — see [below](#with-a-second-factor) |
| `secondFactor.confirm(challenge, code, { device })` | the same, once the code is right |
| `secondFactor.recover(challenge, code, { device })` | the same, after `user.recoveryCodeUsed` |
| `signInCode.confirm(challenge, code, { device })` | the same — or a challenge, with an active second factor |
| `magicLink.confirm(token, { device })` | the same — or a challenge, with an active second factor |

A step-up opens no session, and takes no device. With several user types,
the calls are the type's: `clinic.staff.signIn(input, { device })`.

What `device` says:

| `device` | Means | The answer |
| --- | --- | --- |
| a string | the token the client holds — an earlier answer's `deviceToken` | `newDevice: false` and the same token when it proves this user signed in there; otherwise `newDevice: true` and a fresh token |
| `null` | the client holds no token yet | `newDevice: true` and a fresh token — `false` on `signUp` |
| absent | **devices are not tracked for this call** | `newDevice: false`, `deviceToken: null`, no event |

**A token that proves nothing is a new device, never an error.** Malformed,
forged, another user's, or signed with a key no longer held: the sign-in
succeeds, answers `newDevice: true` and a fresh token. The value came from a
request, so nothing about it is refused — only its type, from JavaScript.

**`undefined` is not `null`.** A cookie read as `string | undefined` and
handed over as it is makes every browser without a cookie untracked: it is
never given a token, and never reported. With `exactOptionalPropertyTypes`
in your tsconfig that is a compile error — `TS2379: … Type 'string |
undefined' is not assignable to type 'string | null'` — and without it, it
compiles and tracks nothing. Say what you mean:

```ts
const cookie: string | undefined = readCookie(request, 'device'); // yours
await auth.signIn(credentials, { device: cookie ?? null });
```

## What the answer says

`SignedIn` — and so `RecoveredSignIn` — carries two more fields:

```ts
interface SignedIn<U> {
	readonly status: 'signedIn';
	readonly user: U;
	readonly session: Session;
	readonly token: string;
	readonly newDevice: boolean;          // false without a device, and on signUp
	readonly deviceToken: string | null;  // null without a device: nothing minted
}
```

- **`deviceToken`** is what the client keeps, and presents as `device` at its
  next sign-in: the token it presented, a fresh one for a new device, or the
  same device signed again with the first key after a
  [rotation](#rotating-the-keys-and-forgetting-devices). Set the cookie again
  on every sign-in: it keeps it alive.
- **`newDevice`** is `true` when the session was opened from a device the
  user had not signed in from — and `user.newDeviceSignedIn` was then sent.

A test double that builds a `SignedIn` by hand needs both fields:
`{ …, newDevice: false, deviceToken: null }`.

## With a second factor

A user whose second factor is active gets a challenge from `signIn`, and
**the challenge carries no device**. Give the device again to
`secondFactor.confirm` or `secondFactor.recover`, from the same cookie:

```ts
const result = await auth.signIn(credentials, { device: cookie ?? null });
if (result.status === 'secondFactor') {
	// …the next request, with the code:
	const signedIn = await auth.secondFactor.confirm(result.challenge, code, { device: cookie ?? null });
	signedIn.newDevice; // decided here, once the code is right
}
```

The challenge answer has no `newDevice` and no `deviceToken`, and sends no
event: nothing is known until the code is. A confirmation given no device is
untracked, whatever `signIn` was given. The same holds for a
`signInCode.confirm` or `magicLink.confirm` that answered a challenge.

## Keeping the token: the cookie

The token is made of cookie-value characters — `d1.<key id>.<device id>.<mac>`
— so it goes into a cookie as it is. Keep it in **its own long-lived cookie**,
`HttpOnly` and `Secure`, apart from the session cookie: it outlives every
session, and signing out leaves it, so the device stays known.

With Hono, [`@nxgt/janus-hono`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-hono/README.md)
reads it with `deviceOf(c)` and sets it in `sendSession` whenever the answer
carries a `deviceToken`:

```ts
import { deviceOf, sendSession } from '@nxgt/janus-hono';

app.post('/sign-in', async (c) => {
	const { email, password } = await c.req.json();
	const signedIn = await auth.signIn({ email, password }, { device: deviceOf(c) });
	const user = sendSession(c, auth, signedIn); // the session cookie, and the device cookie
	return c.json({ id: user.id });
});
```

Anywhere else, a fetch-style handler sets both cookies itself:

```ts
const DEVICE = 'device';
const FOUR_HUNDRED_DAYS = 400 * 24 * 60 * 60; // the longest a browser keeps a cookie

function cookieOf(request: Request, name: string): string | null {
	const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
	return match?.[1] || null; // no cookie, or an empty one: the client holds no token
}

export async function signIn(request: Request): Promise<Response> {
	const { email, password } = (await request.json()) as { email: string; password: string };
	const signedIn = await auth.signIn({ email, password }, { device: cookieOf(request, DEVICE) });
	const headers = new Headers();
	headers.append('Set-Cookie', auth.cookie.serialize(signedIn.token, signedIn.session));
	if (signedIn.deviceToken !== null) {
		headers.append(
			'Set-Cookie',
			`${DEVICE}=${signedIn.deviceToken}; Max-Age=${FOUR_HUNDRED_DAYS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
		);
	}
	return Response.json({ id: signedIn.user.id }, { headers });
}
```

A bearer client — a mobile app — keeps `deviceToken` beside its session
token, and sends it with its next sign-in.

**One cookie holds one user's token.** Two people who share a browser and
take turns signing in each present the other's token — which proves nothing
for them — and each gets a new token and a notice at every turn. That is
the price of storing nothing.

## The event: `user.newDeviceSignedIn`

A sign-in from a new device sends
[`user.newDeviceSignedIn`](events.md#the-eleven-types) to `janus({ events })`:

```ts
{
	id: '0199…',                    // a UUIDv7 minted for this event
	type: 'user.newDeviceSignedIn',
	occurredAt: Date,               // the new session's createdAt
	userId: '0199…',
	userType: 'user',
	sessionId: '0199…',             // the session the new device holds
}
```

It is the second exception to *the user by id only*, after `formerEmail`:
`sessionId` names the session the new device holds, so a "this wasn't me"
page can end that one — `store.sessions.revokeSession(sessionId, new Date())`
on the store you wired — or every session with
`auth.signOutEverywhere(user)`. `@nxgt/janus-webhooks` posts the event
without it: a session id stays in the process.

- **Sent once the sign-in is complete.** A wrong password sends nothing, nor
  does a `signIn` refused after its session opened — a password written
  meanwhile — nor a challenge.
- **After the others.** `secondFactor.recover` sends it after
  `user.recoveryCodeUsed`; a first proof of the e-mail by
  [code](sign-in-code.md) or [link](magic-link.md) sends it last, after
  `user.emailVerified` and what that proof removed.
- **Never** from `signUp`, from a call given no device, or from a device the
  token proved.

## The e-mail: `@nxgt/janus-mail`'s `newSignIn`

[`@nxgt/janus-mail`](https://www.npmjs.com/package/@nxgt/janus-mail) sends
the notice, in English and French — "New sign-in to your account", the
device, where, when, and a button to your security settings. Every value is
your text, in the recipient's locale: **Janus sees no IP and no
`User-Agent`**, so describing the device, formatting the time in the user's
time zone and finding a location — from a geo-IP of your own, if you have one
— are yours. Without a location, the e-mail shows `—`.

From the sign-in's answer, where the request is in hand:

```ts
// `mail` is janusMail({ … }), and the user schema holds a name and a locale.
const signedIn = await auth.signIn({ email, password }, { device: cookieOf(request, DEVICE) });
if (signedIn.newDevice) {
	const { user } = signedIn;
	await mail.newSignIn(
		{ name: user.name, email: user.email, locale: user.locale },
		{
			device: describeDevice(request.headers.get('user-agent')), // yours: 'Firefox on macOS'
			time: new Intl.DateTimeFormat(user.locale, { dateStyle: 'long', timeStyle: 'short', timeZone }).format(
				signedIn.session.createdAt,
			),
		},
	);
}
```

Or from the event, which names the user by id alone:

```ts
const auth = janus({
	...config,
	async events(event) {
		if (event.type !== 'user.newDeviceSignedIn') return;
		const user = await auth.get(event.userId);
		const time = new Intl.DateTimeFormat(user.locale, { dateStyle: 'long', timeStyle: 'short', timeZone }).format(
			event.occurredAt,
		);
		await mail.newSignIn({ name: user.name, email: user.email, locale: user.locale }, { device: 'a new device', time });
	},
});
```

The event has no request to describe the device from: send from the answer
when you want the device named, or put the description in the job your
route queues.

## What a token proves, and what it does not

A device token is `d1.<key id>.<device id>.<mac>`: 16 random bytes of device
id, and an HMAC-SHA256 of the user's id and the device id, under a key
derived (HKDF) from the device key. So:

- **It is bound to the user.** A token copied onto another user's sign-in
  proves nothing there, and is a new device.
- **It cannot be forged** without the key, and a changed character proves
  nothing.
- **It proves only "this user signed in here before".** It is not a
  session and not a credential: never authenticate a request with it, never
  let it skip a password or a second factor. Whoever copies the cookie
  copies a device, and the worst it buys is one notice fewer.

## Rotating the keys, and forgetting devices

The first key signs; every key checks. To rotate, put a new key first and
keep the old one:

```ts
devices: {
	keys: [
		{ id: '2027-03', key: process.env.DEVICES_KEY_2027_03 ?? '' }, // signs
		{ id: '2026-09', key: process.env.DEVICES_KEY_2026_09 ?? '' }, // still checks
	],
},
```

A token signed by the older key is known, and the answer's `deviceToken` is
the same device signed again with the first: every device that signs in
moves to the new key by itself.

**Removing a key is the only way to forget devices, and it forgets every
device that key signed.** Each one is reported new once, at its next
sign-in, then known again. There is no way to forget one device alone —
nothing is stored to delete. After a breach, drop every key and start with a
new one: every user gets one notice per device.

## Errors

Both are bare `TypeError`s — wiring mistakes, thrown before anything is
written. `<call>` is the call you wrote: `signIn`, `secondFactor.confirm`, or
`patient.signIn` with several user types.

| Message | Cause |
| --- | --- |
| `<call>: a device was given, but janus() has no devices — pass devices: { keys }` | `{ device }`, even `null`, given to a `janus()` wired without `devices` |
| `<call>: options.device must be the device token the client holds, or null when it holds none` | a `device` that is neither a string nor `null`, from JavaScript or through a cast |

The configuration's are [above](#wiring). Every call may still reject as it
did — `CREDENTIALS_INVALID`, `CODE_INVALID`, `STORE_FAILED` — and a device
never adds a refusal of its own.

## In a test

```ts
import { expect, it } from 'bun:test';
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher, type UserEvent } from '@nxgt/janus';

it('tells a new device from a known one', async () => {
	const received: UserEvent[] = [];
	const auth = janus({
		user: z.object({ email: z.email() }),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }), // fast in tests; keep the default in production
		devices: { keys: [{ id: 'test', key: Buffer.alloc(32, 7).toString('base64') }] },
		events: (event) => void received.push(event),
	});
	const credentials = { email: 'ada@example.com', password: 'correct horse' };
	const { deviceToken } = await auth.signUp(credentials, { device: null });

	const known = await auth.signIn(credentials, { device: deviceToken });
	const fresh = await auth.signIn(credentials, { device: null });

	expect(known.newDevice).toBe(false);
	expect(fresh.newDevice).toBe(true);
	expect(received.filter((event) => event.type === 'user.newDeviceSignedIn')).toEqual([
		expect.objectContaining({ userId: fresh.user.id, sessionId: fresh.session.id }),
	]);
});
```

## Signatures

```ts
interface SignInOptions {
	readonly device?: string | null; // the token the client holds, or null for none; absent: untracked
}

// On every user type with a password:
signUp(input: In & { readonly password: string }, options?: SignInOptions): Promise<SignedIn<U>>;
signIn(input: { readonly [K in Login]: string } & { readonly password: string }, options?: SignInOptions): Promise<Answer>;
secondFactor.confirm(challenge: string, code: string, options?: SignInOptions): Promise<SignedIn<U>>;
secondFactor.recover(challenge: string, code: string, options?: SignInOptions): Promise<RecoveredSignIn<U>>;

// On every user type with an e-mail:
signInCode.confirm(challenge: string, code: string, options?: SignInOptions): Promise<Answer>;
magicLink.confirm(token: string, options?: SignInOptions): Promise<Answer>;

janus({ ..., devices?: DevicesConfig });
```

`Answer` is `SignInResult<U>` on a type with a password in an instance given
a `secondFactor`, and `SignedIn<U>` everywhere else. `DevicesConfig`,
`SignInOptions` and `SealingKey` are exported types of `@nxgt/janus`.

## See also

- [User events](events.md) — `user.newDeviceSignedIn` among the eleven types, and when the listener runs
- [The second factor](second-factor.md#confirming-the-code-at-sign-in) — the challenge the device is given again after
- [Sessions](sessions.md) — the session cookie, beside the device cookie
- [`@nxgt/janus-hono`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-hono/docs/guide/routes.md#the-device-cookie) — `deviceOf` and `sendSession`'s device cookie
- [`@nxgt/janus-mail`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-mail/docs/guide/sending.md#newsigninto--device-time-location-) — `newSignIn`
- [Troubleshooting](../troubleshooting.md#devices) — every sign-in reports a new device, and the messages above
