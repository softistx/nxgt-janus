---
'@nxgt/janus': minor
---

The identity stores' port gains a user's recovery codes. `SecondFactorRecord` has a new field, `recoveryCodes: readonly string[]`: the keyed hashes of the codes a user can sign in with when their phone is gone, opaque to a store like `secret`, in order, and `[]` for none. A patch that names `secondFactor` replaces the codes whole, and `secondFactor: null` removes them with the factor. `enroll` now writes a factor with `recoveryCodes: []`.

The conformance case `users.secondFactorSlot` checks it: the codes round-trip in order, `[]` comes back as a factor with no codes and never as `null`, a patch replaces the array whole, and `secondFactor: null` clears it. The case now lives in `conformance/cases/users/second-factor.ts`; its id is unchanged.

**Breaking for a third-party adapter: it must store and answer `recoveryCodes`.** Until it does, it no longer compiles against `SecondFactorRecord`, and `users.secondFactorSlot` fails. Read a factor written before the field existed as `[]` — a nullable column, an optional field — rather than rewriting every user. Nothing changes for an application: no call, option or answer is different. The official adapters follow in `@nxgt/janus-drizzle` 0.4 and `@nxgt/janus-mongo` 0.5; `@nxgt/janus-redis` stores no user.
