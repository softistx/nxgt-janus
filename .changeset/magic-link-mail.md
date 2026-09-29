---
'@nxgt/janus-mail': minor
---

The sign-in link's e-mail: `mail.magicLink(issued, to?, options?)` sends what `@nxgt/janus` 0.15's `auth.magicLink.request(email)` answered, once checked for `null`, to `issued.email`. It is built from `@nxgt/mail-presets` 1.0.1's `magic-link`, in English and French: "Your sign-in link" / "Votre lien de connexion", a **Sign in** button, and how long the link lasts, read from `issued.expiresAt` — "This link expires in 15 minutes."

- The button is built by the new `links.magicLink(token)`. **It is optional**, for an application that sends no sign-in link. Without it, `mail.magicLink` throws a `TypeError` — `janusMail.magicLink: links.magicLink is missing — …` — before anything is rendered: no page can stand in for it. Point it at a page of yours that spends nothing, whose button posts the token to the route calling `auth.magicLink.confirm`.
- A sign-in code's answer given to `magicLink` is a compile error: it has no token, and its challenge must never be mailed. Four new compile-time refusals: 40.
- **Breaking for a locale beyond `en` and `fr`: `templates` must include `magicLink`.** Ten templates now, and with such a locale every one is yours — a `templates` written for 0.6 is a compile error (`Property 'magicLink' is missing`), and a `TypeError` in JavaScript, until it has one. It is given `brand`, `link` and `expiresIn`.
- **Breaking for an exhaustive `switch` over `JanusMailTemplateName`**, which gains `'magicLink'`.
- The package builds ten e-mails; the `@nxgt/janus` peer is 0.15.
