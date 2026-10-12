---
'@nxgt/janus': minor
---

**Adapters: a store that lists the token kinds must list `changeEmail` before this release is used with it** — a breaking change for an adapter you wrote (`TokenKind` gained a member, and a `Record<TokenKind, …>` of yours no longer compiles). `TokenKind` gains `changeEmail`, the token of a link sent to a user's new address. A store that lists the kinds — a `CHECK`, a validator's enum — has to list it, which the conformance suite proves with `tokens.everyKind`, and a new case, `tokens.changeEmailKind` (59 cases), holds that a change and a verification are neither counted, spent nor answered as one another. For a `changeEmail` token, `address` is the new address and `codeHash` the address it replaces, keyed by the token's secret: `TokenRecord.codeHash` documents it.
