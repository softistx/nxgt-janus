---
'@nxgt/janus': minor
'@nxgt/janus-drizzle': minor
'@nxgt/janus-mongo': minor
'@nxgt/janus-redis': minor
---

The store port gains what one-time codes need. No flow uses it yet: the second factor and e-mail sign-in codes come next.

- `UserRecord.secondFactor` is a TOTP secret the core seals, with its confirmation and the last step accepted, or `null`. `UserPatch` names it like `password`.
- `TokenRecord` gains `codeHash` and `attempts`, and `TokenKind` gains `'secondFactor'` and `'signInCode'`.
- `TokenStore.countAttempt(tokenHash, kind)` is a new required method. It is one conditional write that counts an attempt at a code and answers the token after it. A spent token is answered as it is, and an unknown one is `null`.

**For an adapter author:** implement `countAttempt`, store the new fields, and run the conformance suite. It has six new cases, including twenty concurrent attempts that must answer twenty distinct counts, and attempts racing a redemption that must never be counted once it spent the token.

**`@nxgt/janus-drizzle`:** `users` gains four `second_factor_*` columns, and `tokens` gains `code_hash` and `attempts`. Run `drizzle-kit generate`, then migrate, before deploying.

**`@nxgt/janus-mongo`:** rewrite no document, but **run `syncMongoAdapter(db)` or `syncMongoStores(db)` before deploying**. The validator the previous sync wrote refuses the new fields, so every sign-up and one-time token fails with `STORE_FAILED` (`Document failed validation`) until it runs. A document written before reads as no second factor, no code and no attempt.

**`@nxgt/janus-redis`** needs no migration: a token written before reads as no code and no attempt.
