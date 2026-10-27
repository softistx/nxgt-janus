---
"@nxgt/janus-mail": patch
---

Inline the default e-mails in the package's JavaScript, so an application can bundle `@nxgt/janus-mail` (`bun build`, esbuild, Vite) without losing its `mails/` folder. They are written once to the system's temporary folder on the first render. The `mails/` folder is no longer shipped. Fixes #284.
