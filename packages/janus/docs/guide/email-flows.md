# E-mail verification and password reset

This page is for the two one-time-token flows: proving a user holds their
e-mail, and resetting a forgotten password. `janus` issues and redeems the
tokens; **sending the e-mail is yours**.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

async function sendMail(to: string, link: string): Promise<void> {
	// your mailer
}

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const { user } = await auth.signUp({ email: 'ada@example.com', name: 'Ada', password: 'correct horse' });

const sent = await auth.verifyEmail.send(user); // { token, email, expiresAt }
await sendMail(sent.email, `https://app.example/verify?token=${sent.token}`);

// when the link is followed: the token comes back from the query string
const verified = await auth.verifyEmail.confirm(sent.token);
verified.emailVerified; // true
```

## Which types have these flows

`verifyEmail` exists on a type with an e-mail field: the one `email` names, or
a required string field called `email`. `resetPassword` needs an e-mail **and**
a password. On a type without them the flows are **absent from its type**, not
failing at run time:

```ts
const clinic = janus({
	users: {
		staff: { schema: z.object({ username: z.string() }), password: { login: 'username' } },
		patient: { schema: z.object({ contact: z.email() }), password: { login: 'contact' }, email: 'contact' },
	},
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

clinic.patient.verifyEmail.send; // exists: `email` names the field
// @ts-expect-error — staff has no e-mail, so no verifyEmail
clinic.staff.verifyEmail;
```

A type with an e-mail can also sign in with a code sent to it, with or
without a password — see [sign-in codes](sign-in-code.md).

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `email` | a field name | `'email'` | The field the tokens are sent to, per type |
| `tokens.verifyEmail` | `Duration` | `'24h'` | How long a verification token lives |
| `tokens.resetPassword` | `Duration` | `'1h'` | How long a reset token lives |

## `verifyEmail`

```ts
readonly verifyEmail: {
	send(user: UserRef): Promise<IssuedToken>; // { token, email, expiresAt }
	confirm(token: string): Promise<User>;
};
```

`send` issues a token for the user's **current** e-mail. `confirm` redeems it
and sets `emailVerified`. A token sent to an e-mail the user has since changed
is `TOKEN_STALE`: confirming it would verify an address nobody holds any more.
The address is checked again on the very record the write replaces, so an
e-mail changed while the link is being redeemed is `TOKEN_STALE` too, and
nothing is written.
Changing the e-mail with `update` sets `emailVerified` back to `false`.

## `resetPassword`

```ts
readonly resetPassword: {
	request(email: string): Promise<(IssuedToken & { user: User }) | null>;
	confirm(token: string, password: string): Promise<User>;
};
```

`request` answers `null` for an e-mail nobody holds. **Never tell the visitor
which**: answer the same page either way.

```ts
export async function forgotPassword(request: Request): Promise<Response> {
	const { email } = (await request.json()) as { email: string };
	const issued = await auth.resetPassword.request(email);
	if (issued !== null) {
		await sendMail(issued.email, `https://app.example/reset?token=${issued.token}`);
	}
	return new Response(null, { status: 202 }); // the same answer either way
}
```

`confirm` sets the password, marks the e-mail verified — the link proved it —
and **signs the user out everywhere**: their sessions are revoked, and every
second-factor challenge still open is spent, so a sign-in started with the
old password cannot be finished. The e-mail is checked again on the record
written, as for `verifyEmail`. It opens no session: call `signIn` next
if that is your policy. A password refused for its length does not spend the
token, so the visitor can try again with the same link.

```ts
import { JanusError } from '@nxgt/janus';

export async function resetPassword(request: Request): Promise<Response> {
	const { token, password } = (await request.json()) as { token: string; password: string };
	try {
		await auth.resetPassword.confirm(token, password);
		return new Response(null, { status: 204 });
	} catch (error) {
		if (!(error instanceof JanusError)) throw error;
		switch (error.code) {
			case 'TOKEN_UNKNOWN':
			case 'TOKEN_SPENT':
			case 'TOKEN_EXPIRED':
			case 'TOKEN_STALE':
				return Response.json({ error: 'link' }, { status: 400 });
			case 'PASSWORD_TOO_SHORT':
				return Response.json({ minLength: error.minLength }, { status: 400 });
			default:
				throw error; // STORE_FAILED: your 503
		}
	}
}
```

## What a token refusal means

| Code | When |
| --- | --- |
| `TOKEN_UNKNOWN` | No token holds that secret — or it was issued for the other flow: a verification token is not a reset token |
| `TOKEN_SPENT` | Already redeemed. Every token is single use |
| `TOKEN_EXPIRED` | Its lifespan passed. It is spent all the same, so it cannot be retried |
| `TOKEN_STALE` | Sent to an e-mail the user no longer has |

Of twenty concurrent redemptions of one token, exactly one succeeds: the store
spends it in one conditional write. The store holds the token's `sha256`,
never the token, and no refusal's message contains it.

## See also

- [Users](users.md) — `email`, `update`, and the other per-type methods
- [Sign-in codes](sign-in-code.md) — the third flow that sends an e-mail: a code, not a link
- [Sessions](sessions.md) — `signOutEverywhere`, which `resetPassword.confirm` calls for you
- [Errors](errors.md) — every code, and the status it deserves
