---
'@nxgt/janus-mail': patch
---

The README warns that no template sends `changeEmail`'s link yet: `mail.verifyEmail(issued)` is not its mail. Send the change link with your own mailer for now; `mail.emailChanged` still tells the former address.
