---
'@nxgt/janus': minor
---

Sign in with a link sent by e-mail — a magic link — on every user type with an e-mail, with or without a password: `auth.magicLink.request(email)` and `auth.magicLink.confirm(token)`.

- `request(email)` answers `{ token, email, expiresAt, user }`, or `null` for nobody and for an inactive user alike. The token is 32 random bytes, base64url, for a link to a page of yours; only its hash is stored. It lives fifteen minutes, `tokens.magicLink`. **Only the last link sent works**: a new `request` spends the ones before, and requests that race leave at most one live.
- `confirm(token)` spends the token in one conditional write — of two confirmations at once, one signs in — refuses `TOKEN_STALE` and `USER_INACTIVE`, marks the e-mail verified with a `user.emailVerified` event, and answers what `signIn` answers: a session, or a second-factor challenge when the user's factor is active. **Confirm it from a `POST`**, from a page the link opens: a mail scanner that follows the link's `GET` must spend nothing. The guide, `docs/guide/magic-link.md`, has that page.
- A link is not ended by a password write — the password proves nothing a link does, as for a sign-in code — and is not counted by the sign-in throttle, which counts passwords. Rate-limit `request` per address and per client.
- **Breaking for an adapter: `TokenKind` gains `'magicLink'`**, a kind of its own so a sign-in code's challenge — handed to whoever asked for the code — is never redeemed as a link. A store that lists the kinds — a `CHECK`, a validator's enum — adds it. **Breaking for an exhaustive `switch` over `TokenKind`** too.
- The conformance suite has 55 cases: `tokens.everyKind` lists `magicLink`, and the new `tokens.magicLinkKind` holds that a link and a sign-in code are never counted, spent nor answered as each other.
- `MagicLinkApi` is exported, as a type. Four new compile-time refusals: 141.
- Docs: the sign-in code guide and `SignInCodeApi.request`'s comment no longer say the earlier codes stay valid after a new `request` — they are spent, as the rest of the documentation says.
