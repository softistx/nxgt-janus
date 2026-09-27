---
"@nxgt/janus-mail": patch
---

The e-mails are now built with `@nxgt/mail-i18n` 0.4.0, `@nxgt/mail-ui` 0.3.0 and `@nxgt/mail-presets` 0.3.0, whose message keys moved to kebab-case. The package names no key, so the built `mails/` is byte for byte the same as before: the e-mails, their subjects, their variables and the manifest (format 1) are unchanged. The `@nxgt/mail` peer is unchanged.
