---
'@nxgt/janus': minor
---

`TokenKind` gains `changeEmail`, the token of a link sent to a user's new address. A store that lists the kinds — a `CHECK`, a validator's enum — has to list it, which the conformance suite proves with `tokens.everyKind`, and a new case, `tokens.changeEmailKind` (59 cases), holds that a change and a verification are neither counted, spent nor answered as one another. For a `changeEmail` token, `address` is the new address and `codeHash` the address it replaces, keyed by the token's secret: `TokenRecord.codeHash` documents it. The `changeEmail` flow itself follows in a later release.
