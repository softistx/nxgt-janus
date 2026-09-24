---
'@nxgt/janus': patch
---

Identities and permissions are each usable alone, and it is now measured:
importing `@nxgt/janus/permissions` loads no identity code, and importing
`@nxgt/janus` loads no permission engine. The README opens with the three ways
to use the package — identities only, permissions only, both — and the guides
share one vocabulary, defined in `docs/guide/vocabulary.md`.

Two messages now use those words: `janus: pass either user (one user type) or
users (several user types), …`, and `defineModel: subjects must be an array of
subject type names — auth.types from janus(), or your own`, which no longer
suggests that permissions need `janus()`.
