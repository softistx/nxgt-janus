# Signing in with an e-mailed link

This page is for signing a user in with a link sent to their e-mail — a
"magic link": no password, nothing to type, and the link proves the address.
`janus` issues and redeems the link's token; **building the link, sending the
e-mail and the page it opens are yours**.

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

const issued = await auth.magicLink.request('ada@example.com'); // { token, email, expiresAt, user } | null
if (issued !== null) {
	const link = `https://app.example/sign-in/link?token=${issued.token}`;
	await sendMail(issued.email, 'Your sign-in link', `${link}\nIt expires in 15 minutes.`);
}

// the link opens a page of yours, whose button POSTs the token back:
const signedIn = await auth.magicLink.confirm(token);
signedIn.token; // a session, as signIn opens one
signedIn.user.emailVerified; // true: the link reached the inbox
```

It is the [sign-in code](sign-in-code.md) with the code folded into a link:
the same users have it, the same refusals, the same second factor. What
differs is what a link is — something anybody holding the e-mail can open,
on any device, **and that a mail scanner opens too**. The words — **one-time
token**, **spent**, **issued** — are defined in
[the vocabulary](vocabulary.md#identities).

## Which types have it

`magicLink` exists on every user type with an e-mail — the field `email`
names, or a required string field called `email` — **with or without a
password**, exactly as `signInCode` does. A type with no e-mail has no
`magicLink`: it is absent from its type, not failing at run time.

```ts
clinic.patient.magicLink.request; // exists
clinic.member.magicLink.request;  // exists: a passwordless type signs in by link or code
// @ts-expect-error — staff have no e-mail to send a link to
clinic.staff.magicLink;
```

## Requesting a link

```ts
const issued = await auth.magicLink.request(email);
```

`request` looks up the user of this type holding that e-mail — trimmed and
lowercased first — and issues a token for them:

```ts
interface IssuedToken {
	readonly token: string;   // 32 random bytes, base64url: for the link, and nowhere else
	readonly email: string;   // the address to send it to, as the user's field holds it
	readonly expiresAt: Date; // fifteen minutes from now, by default
}
// request answers IssuedToken & { readonly user: U } — or null
```

It answers **`null`** when nobody of this type holds that e-mail, when the
user is inactive, and when the value matches a login that only looks like an
e-mail. Nothing is issued, nothing is written.

**Never tell the visitor which.** Answer the same page, with the same
headers — "if an account uses that address, we sent it a link". Unlike a
sign-in code, there is **no decoy to forge**: nothing of a link reaches the
visitor, so the same `202` with no body and no cookie is already the same
answer. Send the e-mail **after** answering, from a queue, so the time the
answer takes does not tell either; the store's one write for a link issued,
and none for `null`, still tells a patient observer.

**At most one link is live per user.** A `request` issues its token, then
spends every other link of the user, so the link in an earlier e-mail
answers `TOKEN_SPENT` — only the last one works. Requests that arrive at
once cannot each keep a link: at most one survives, sometimes none, and the
visitor asks again. A link and a [sign-in code](sign-in-code.md) are
separate kinds: asking for one leaves the other live.

**Rate-limit the request route**, per address and per client, as you would a
password reset: every call sends an e-mail, and cancels the link before it.
Without a limit, anyone who knows an address can fill its inbox.

## Building the link

The token is base64url — safe in a URL without escaping — and goes in a
link to **a page of yours**, never to the route that signs in:

```ts
const link = `https://app.example/sign-in/link?token=${issued.token}`;
```

Put the token **in the e-mail and nowhere else**: not in a log, not in an
analytics event. A query string reaches your server's access log, so leave
the query out of the log line on that path. Only the token's hash is
stored, like a session token's, so the store cannot give it back.

Send it to `issued.email`, not to what the visitor typed: it is the address
the user's field holds, as they registered it.

## Confirming from a `POST`, never from the link's `GET`

**Mail scanners open links.** A corporate gateway, a webmail's safe-browsing
check and an antivirus fetch every URL in an e-mail before the user sees
it, and some run its scripts. A route that signs in on `GET` would spend the
token for the scanner: the user clicks, and gets `TOKEN_SPENT`.

So the link lands on a **page that spends nothing**, and the user's click
on a button there sends the `POST` that calls `confirm`:

```ts
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// GET /sign-in/link?token=… — a page, and nothing else
export function linkPage(request: Request): Response {
	const token = new URL(request.url).searchParams.get('token') ?? '';
	if (!TOKEN.test(token)) return new Response('This link is not valid.', { status: 400 });
	return new Response(
		`<!doctype html><meta charset="utf-8"><title>Sign in</title>
<form method="post" action="/sign-in/link">
	<input type="hidden" name="token" value="${token}">
	<button>Sign in</button>
</form>`,
		{
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Referrer-Policy': 'no-referrer', // the URL holds the token: send it nowhere
				'Cache-Control': 'no-store',
			},
		},
	);
}
```

- **Echo only a token of the token's shape** — 43 base64url characters.
  Anything else written into the page is a cross-site scripting hole.
- **A button, not a script that submits by itself.** A scanner that runs
  scripts submits the form too; one that does not click buttons does not.
  Auto-submitting saves the user a click, at the price of every link a
  script-running scanner opens.
- **`Referrer-Policy: no-referrer`** keeps the URL, and the token in it, out
  of the `Referer` of anything the page loads.

## Confirming the link

```ts
const signedIn = await auth.magicLink.confirm(token);
// { status: 'signedIn', user, session, token }: the session is open
```

`confirm` spends the token, marks the user's e-mail verified — the link
reached the inbox — and opens a session: the same `SignedIn` that `signIn`
answers. **The session opens in the browser that opened the link**, which
need not be the one that asked for it: a link asked for on a laptop and
opened on a phone signs the phone in. Where the sign-in must complete in
the browser that started it, send a [sign-in code](sign-in-code.md) instead.

The token is spent **by the first call**, in one conditional write, whether
that call signs in or is refused: of ten confirmations of one link at once,
exactly one signs in and nine answer `TOKEN_SPENT`. There is nothing to
guess — 256 random bits — so no attempts are counted.

### Lifetime

A link lives **fifteen minutes** unless `tokens.magicLink` says otherwise,
and is `TOKEN_EXPIRED` after that. Fifteen rather than a code's ten: the
e-mail must arrive and be opened, and a scanner may hold it a minute first.
No longer: whoever reads the mailbox in that window signs in.

```ts
janus({ ..., tokens: { magicLink: '30m' } });
```

### The e-mail is verified

A user whose `emailVerified` was `false` has it `true` once `confirm`
succeeds, and their `version` moves; a
[`user.emailVerified` event](events.md) is sent. A user already verified is
not written, and nothing is sent. The proof is written under the version
read: a user written meanwhile answers `VERSION_CONFLICT`, with the link
spent.

### A second factor is still asked for

The link proves the e-mail, not the second factor. With
`janus({ secondFactor })`, a user whose factor is active gets **no session
from the link**: `confirm` answers a challenge, exactly as `signIn` does,
and [`secondFactor.confirm`](second-factor.md#confirming-the-code-at-sign-in)
redeems it with their app's code.

```ts
const result = await auth.magicLink.confirm(token);
if (result.status === 'secondFactor') {
	// result.challenge: for secondFactor.confirm — keep it as a sign-in keeps it
} else {
	// result.token, result.session: set the cookie
}
```

`confirm` answers `SignInResult` on a type whose `signIn` does — a type with
a password, in an instance given a `secondFactor` — and reading `token`
before narrowing on `status` is a compile error there. Anywhere else it
answers `SignedIn`.

### What `confirm` refuses

| Rejects with | When | What to do |
| --- | --- | --- |
| `TOKEN_UNKNOWN` | no such link — a mangled URL, another user type's, a sign-in code's challenge, one whose user was deleted, or one a store's TTL already dropped. Message: `magicLink.confirm: no such token`. Another type's link is spent by the call | ask for a new link |
| `TOKEN_SPENT` | the link already signed someone in, a newer `request` for the same user spent it, or an earlier `confirm` of it was refused. Message: `magicLink.confirm: the token was already used` | ask for a new link, and use the latest e-mail |
| `TOKEN_EXPIRED` | `expiresAt` has passed. The link is spent | ask for a new link |
| `TOKEN_STALE` | the user changed their e-mail since the link was sent. Message: `magicLink.confirm: the token was sent to an e-mail the user no longer has`. The link is spent | ask for a new link, to the current address |
| `USER_INACTIVE` | the user was deactivated since the link was sent. The link is spent | answer 403 |
| `VERSION_CONFLICT` | rare: another write to the user landed while `confirm` marked the e-mail verified. The link is spent | ask for a new link |

Every refusal is a `TokenError` but `USER_INACTIVE`, a `UserInactiveError`;
with several user types the message starts with the type:
`patient.magicLink.confirm: …`. Every call may also reject with
`STORE_FAILED` — `request` as well as `confirm`: your 503, never "no such
account" nor a 401. [Troubleshooting](../troubleshooting.md#sign-in-links)
has each message with its cause.

## What does not end a link

- **Writing the password.** `resetPassword.confirm`, `changePassword` and
  `setPassword` spend the user's reset links and second-factor challenges,
  not their sign-in links: the password proves nothing a link does, and
  whoever holds the inbox can ask for another link anyway. The same holds
  for sign-in codes.
- **Signing out everywhere.** It revokes sessions; a link opens a new one.
- **The sign-in throttle.** `signIn.throttle` counts passwords tried at one
  login; a link is not a password, and its token cannot be guessed. Limit
  `magicLink.request` yourself, as above.

What does: its own redemption, a newer `request`, its fifteen minutes, an
e-mail changed since (`TOKEN_STALE`), the user deactivated
(`USER_INACTIVE`), and deleting the user, which deletes every token of
theirs.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `tokens.magicLink` | `Duration` | `'15m'` | How long a link can be confirmed |
| `email` | a field name | `'email'` | The field the link is sent to, and looked up by, per type |

A `tokens.magicLink` that is not a duration is refused when `janus()` is
called, with a `TypeError`: `janus: tokens.magicLink: "<value>" is not a
duration; …`.

## As routes

The page above, and a fetch-style pair beside it — the shape Bun and most
frameworks hand you:

```ts
import { JanusError } from '@nxgt/janus';

// POST /sign-in/email/link — ask for a link
export async function requestLink(request: Request): Promise<Response> {
	const { email } = (await request.json()) as { email: string };
	const issued = await auth.magicLink.request(email);
	if (issued !== null) {
		const link = `https://app.example/sign-in/link?token=${issued.token}`;
		void sendMail(issued.email, 'Your sign-in link', link); // not awaited
	}
	return new Response(null, { status: 202 }); // the same answer either way
}

// POST /sign-in/link — the page's button
export async function confirmLink(request: Request): Promise<Response> {
	const token = String((await request.formData()).get('token') ?? '');
	try {
		const signedIn = await auth.magicLink.confirm(token);
		return new Response(null, {
			status: 303,
			headers: { Location: '/', 'Set-Cookie': auth.cookie.serialize(signedIn.token, signedIn.session) },
		});
	} catch (error) {
		if (error instanceof JanusError && error.code !== 'STORE_FAILED') {
			return new Response(null, { status: 303, headers: { Location: '/sign-in?link=expired' } });
		}
		throw error; // STORE_FAILED: your 503
	}
}
```

A refused link sends the user back to ask for another: every `TOKEN_*`
means the same thing to them. With a `secondFactor` configured, narrow
`confirm`'s answer on `status` before reading `token`, and hand the
challenge on to [the second factor's route](second-factor.md#a-sign-in-with-a-code-as-routes).

## In a test

No mailbox needed: `request` answers the token it would have sent.

```ts
import { expect, it } from 'bun:test';
import { z } from 'zod';
import { createMemoryStores, fixedClock, janus } from '@nxgt/janus';

it('signs in with the e-mailed link, once, and not after fifteen minutes', async () => {
	const clock = fixedClock(Date.UTC(2026, 0, 1));
	const auth = janus({ user: z.object({ email: z.email() }), store: createMemoryStores(), clock });
	await auth.create({ email: 'ada@example.com' });

	const issued = await auth.magicLink.request('ada@example.com');
	if (issued === null) throw new Error('expected a link');
	expect((await auth.magicLink.confirm(issued.token)).user.emailVerified).toBe(true);
	await expect(auth.magicLink.confirm(issued.token)).rejects.toMatchObject({ code: 'TOKEN_SPENT' });

	const late = await auth.magicLink.request('ada@example.com');
	if (late === null) throw new Error('expected a link');
	clock.advance(15 * 60_000);
	await expect(auth.magicLink.confirm(late.token)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
});
```

## Signatures

```ts
interface MagicLinkApi<U, Answer = SignedIn<U>> {
	readonly magicLink: {
		request(email: string): Promise<(IssuedToken & { readonly user: U }) | null>;
		confirm(token: string): Promise<Answer>;
	};
}
```

`Answer` is `SignInResult<U>` on a type with a password in an instance given
a `secondFactor`, and `SignedIn<U>` everywhere else. `MagicLinkApi` and
`IssuedToken` are exported from `@nxgt/janus`, as types.

## For an adapter

A link is a token of kind **`magicLink`**, new in 0.15. A store that lists
the kinds — a `CHECK`, a validator's enum — lists it too; the conformance
suite's `tokens.everyKind` fails until it does, and `tokens.magicLinkKind`
holds that a link and a sign-in code are never redeemed as each other. See
[adapters](adapters.md#sessionstore-and-tokenstore).

## See also

- [Sign-in codes](sign-in-code.md) — the same sign-in with a code to type, which completes in the browser that asked
- [The second factor](second-factor.md) — the challenge `confirm` answers for a user whose factor is active
- [E-mail verification and password reset](email-flows.md) — the other flows that send a link, and `TOKEN_STALE`
- [Sessions](sessions.md) — the cookie the session is sent in
- [Errors](errors.md) — every code and its status
- [Troubleshooting](../troubleshooting.md#sign-in-links) — by the message you see
