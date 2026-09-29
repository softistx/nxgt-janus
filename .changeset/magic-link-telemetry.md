---
'@nxgt/janus-telemetry': minor
---

Sign-in links in the audit trail, for `@nxgt/janus` 0.15's `magicLink`:

- `janus.magicLink.sent` when `magicLink.request` issued a link — never its token, nor the address; nothing when it answered `null`.
- A sign-in by link is `janus.signIn` with `janus.signIn.magicLink: true`, and each refusal of `magicLink.confirm` a `janus.signIn.refused` with the same mark and its `janus.refusal` code. A link that asks for the second factor is `janus.signIn.secondFactor`.
- The `magicLink.confirm` span records `janus.signIn.status`, `signedIn` or `secondFactor`, as `signIn`'s and `signInCode.confirm`'s do.

Without this release, sign-ins by link are missing from the audit trail.
