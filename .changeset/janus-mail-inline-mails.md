---
"@nxgt/janus-mail": minor
---

Inline the default e-mails in the package's JavaScript, so an application can bundle `@nxgt/janus-mail` (`bun build`, esbuild, Vite) without losing its `mails/` folder. New requirement: a writable `TMPDIR` at the first render, where the e-mails are written to a private folder, read and removed (a plain `Error` naming it otherwise). The `mails/` folder is no longer shipped. Fixes #284.
