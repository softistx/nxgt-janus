---
'@nxgt/janus': minor
---

**Behaviour change — security fix: an old reset link no longer works.** `resetPassword.request` now spends the user's earlier reset links, so only the last e-mail's link works, and every password write — `resetPassword.confirm`, `changePassword` and `setPassword` — spends every reset link still live. Before, a link sent before the password was reset or changed could still replace the new password. Such a link now answers `TOKEN_SPENT`. The links are spent after the password is written; an outage at that step fails the call with `STORE_FAILED`, and the next `request` spends them. Sign-in codes and step-ups are not spent: the password proves neither. No change for adapters: the existing `TokenStore.spendUserTokens` does it.
