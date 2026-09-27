---
'@nxgt/janus-mail': patch
---

The e-mails now follow the reader's dark mode. They are rebuilt with `@nxgt/mail-ui` 0.4.0, `@nxgt/mail-presets` 0.4.0 and `@nxgt/mail-i18n` 0.5.0, and each HTML part declares `color-scheme: light dark`. A mail client that reads `prefers-color-scheme`, or Outlook's `[data-ogsc]`, shows a dark page, a dark card and light text when the reader is in dark mode. Gmail always shows the light e-mail, as before. The text parts, the subjects, the variables and the manifest (format 1) are unchanged, and so is the JavaScript. The `@nxgt/mail` peer stays `>=0.1.0 <1`. An override that returns its own `html` is not affected.
