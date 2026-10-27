---
'@nxgt/janus-mail': minor
---

Render the default e-mails from memory: the inlined templates go to `@nxgt/mail`'s `createMailRenderer({ files })`, so nothing is written to a temporary folder and `TMPDIR` no longer has to be writable. The `@nxgt/mail` peer floor rises to `>=1.1.0 <2`.
