---
"@nxgt/janus-mail": minor
---

`mail.signUpAttempted(to, { device?, time? })` e-mails the owner of an address someone tried to sign up with, for a sign-up that answers the same whether the address is new or taken. It is the new `signUpAttempted` template, built from `@nxgt/mail-presets` 1.3.0's `sign-up-attempted` in English and French, and links to `links.getStarted()`. A missing `device` or `time` reads "Unknown" ("Inconnu") in the send's locale. There are now fourteen templates: `templates` written for a locale beyond `en` and `fr` must add `signUpAttempted`.
