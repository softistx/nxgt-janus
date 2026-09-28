---
'@nxgt/janus-mail': patch
---

In dark mode the sign-in code's box is no longer a light slab. It is now a mid slate (`#94a3b8`), a clear step above the dark card (6.95:1), and the code on it stays near-black, at 7.76:1. The page behind the card is darker again (`#040a19`), so the card stands out from it more than in 0.3.1. The e-mails are rebuilt with `@nxgt/mail-ui` 0.6.0 and `@nxgt/mail-presets` 0.4.2. The footer and the notices' "if this was not you" line keep their colour. Gmail still shows the light e-mail. Light mode, the text parts, the subjects, the variables, the manifest (format 1) and the JavaScript are unchanged. The `@nxgt/mail` peer stays `>=0.1.0 <1`. An override that returns its own `html` is not affected.
