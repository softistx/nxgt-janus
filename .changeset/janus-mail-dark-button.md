---
'@nxgt/janus-mail': patch
---

The button now shows in dark mode. Until now it kept its near-black colour on the dark card, where it all but vanished (1.2:1). Under dark mode it is now near-white (`#fafafa`, 17:1 against the card) with near-black text (`#18181b`), in every client that follows dark mode; Gmail still shows the light e-mail. The page behind the card follows the new colour and sits a shade lighter, close to the card, which its border outlines. The e-mails are rebuilt with `@nxgt/mail-ui` 0.5.0, `@nxgt/mail-presets` 0.4.1 and `@nxgt/mail-i18n` 0.6.0. Light mode, the text parts, the subjects, the variables, the manifest (format 1) and the JavaScript are unchanged. The `@nxgt/mail` peer stays `>=0.1.0 <1`. An override that returns its own `html` is not affected.
