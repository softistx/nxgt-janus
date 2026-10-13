---
'@nxgt/janus-mail': minor
---

`mail.changeEmail(issued, to, options?)` sends the link `auth.<type>.changeEmail.send(user, newEmail)` issued, to `issued.email` — the new address — with the `confirm-new-email` preset of `@nxgt/mail-presets` 1.2.0, in English and French: it greets `to.name`, says the account moves to this address once the link is followed, and how long it lasts. `links` gains `changeEmail: (token) => string`, optional like `magicLink`: links written before it keep compiling, and the send is a `TypeError` without it. Thirteen templates now (`changeEmail`), so a `templates` for a locale beyond `en` and `fr` must add it. `emailChanged` still tells the former address once the link is redeemed.
