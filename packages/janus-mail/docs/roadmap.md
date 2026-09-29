# Roadmap

Where `@nxgt/janus-mail` is heading. A direction, not a commitment: there are
no dates here, and the version something shipped in is the only number.

## Now

Nothing between releases.

## Next

- **The invitation** — `invitation` from `@nxgt/mail-presets`, once
  `@nxgt/janus` has a flow that sends it: an invitation to a user type.
- **The other presets of `@nxgt/mail-presets` 0.4.0** — `account-deleted`,
  after a user is deleted, once `@nxgt/janus` has a deletion a link can
  undo; and `invitation-accepted`, once it has invitations.

## Later

- **An inlined build, for edge runtimes** — the default e-mails compiled into
  the JavaScript itself rather than read from `mails/` with `node:fs`, so the
  package runs where there is no file system.
- **More built-in languages** — each one a catalogue of the presets'
  messages, so a locale beyond `en` and `fr` no longer requires every
  template.
- **Your brand at build time** — a logo, a link and your colours, from a
  Maizzle build of your own over the same presets, read by the same
  renderer.

## Not planned

- **An error class of its own** — a send rejects with the mailer's
  `MailFailure` or `MailRefused`, untouched, so one `instanceof` against
  `@nxgt/mail` answers every failure, whichever package sent the e-mail.
- **Retries or a queue** — a retry is the application's decision, made where
  it can see it; hand a send to a queue that retries a `MAIL_FAILED`, or pass
  a mailer wrapped in `@nxgt/mail`'s `withRetry` (0.8 or later).
- **Sending from inside `janus()`** — `@nxgt/janus` stays free of e-mail:
  its flows answer what to send, and this package is called with that answer.
  An application that sends its own way needs neither this package nor a
  hook to turn off.
- **The challenge in an e-mail** — a sign-in code's or a step-up's e-mail
  carries the code and never the challenge, not even through an override.

## Shipped

Newest first; from the first release on, the package's CHANGELOG holds every one.

- **A readable summary and a location in words, v0.9.1.** Built with
  `@nxgt/mail-config` 1.0.2 and `@nxgt/mail-presets` 1.1.1, the text part of
  `newSignIn` gives each row of its summary on one line — `Device Firefox on
  macOS` — with no blank line between rows, where it split each into a label
  line and a value line. A new sign-in sent without `location` says "Unknown
  location", "Lieu inconnu" in French, in the recipient's locale, where it
  showed `—`.

- **The new sign-in notice, v0.9.0.** `newSignIn(to, { device, time,
  location? })`, built from `@nxgt/mail-presets` 1.1.0's `new-sign-in` in
  English and French — "New sign-in to your account", which device, where
  and when, and a **Secure my account** button to `links.secureAccount()`:
  send it when an `@nxgt/janus` 0.17 sign-in answers `newDevice: true`, or
  on `user.newDeviceSignedIn`. Every value is your text in the recipient's
  locale; `@nxgt/janus` sees no IP, so `location` is yours, and `—` without
  one. Twelve e-mails now, and twelve templates to pass for a locale beyond
  `en` and `fr`.

- **The step-up's code, v0.8.0.** `stepUp(issued, to, options?)`, built
  from `@nxgt/mail-presets` 1.1.0's `confirm-action` in English and French:
  send what `@nxgt/janus`'s `auth.stepUp.request(user)` answered, once
  narrowed to `via: 'email'`, to `issued.email` — "Your confirmation code",
  the code, how long it lasts, and a **Secure my account** button to
  `links.secureAccount()` for a user who asked for nothing. A step-up
  confirmed with the user's app sends nothing, and is refused. Eleven
  e-mails now, and eleven templates to pass for a locale beyond `en` and
  `fr`.

- **The sign-in link, v0.7.0.** `magicLink(issued, to?, options?)`, built
  from `@nxgt/mail-presets` 1.0.1's `magic-link` in English and French:
  send what `@nxgt/janus` 0.15's `auth.magicLink.request(email)` answered,
  to `issued.email`, its button built by the new, optional
  `links.magicLink(token)` and its expiry read from `issued.expiresAt` —
  "This link expires in 15 minutes." Without `links.magicLink`, the send is
  a `TypeError`. Ten e-mails now, and ten templates to pass for a locale
  beyond `en` and `fr`.

- **The change notices on their events, v0.6.0.** `passwordChanged` and
  `emailChanged` are sent from `@nxgt/janus` 0.14's `user.passwordChanged`
  and `user.emailChanged` events, as the two-factor notices are, rather than
  after the call: whoever changed the password or the e-mail, the user is
  told. `emailChanged` goes to the event's `formerEmail`, the inbox the
  account just left, and the compiler refuses it unchecked for `null`.

- **The recovery code notice, and a readable link in both modes, v0.5.0.**
  `recoveryCodeUsed(to, { when, recoveryCodesLeft })`, built from
  `@nxgt/mail-presets` 1.0.0's `recovery-code-used` in English and French:
  send it on `@nxgt/janus`'s `user.recoveryCodeUsed` event, with the count
  `auth.secondFactor.recoveryCodesLeft(user)` reads (`@nxgt/janus` 0.11),
  written as the preset's plural in the recipient's locale — "You have 1
  recovery code left." Its button links to the new, optional
  `links.recoveryCodes()`, else `links.secureAccount()`. Nine e-mails now,
  and nine templates to pass for a locale beyond `en` and `fr`. The link
  under the button is a blue of each mode's own — 6.70:1 on the light card,
  where it read 2.63:1, and 9.89:1 on the dark one — from `@nxgt/mail-ui`
  1.0.0's `color-info-dark`. The `@nxgt/mail` peer widens to `>=0.1.0 <2`,
  so `@nxgt/mail` 1.0 and its transports are admitted; the manifest is still
  format 1.
- **Muted text at 4.5:1 or more in both modes, v0.4.1.** Under dark mode the
  sign-in code's box is a slate a step above the dark card with light code on
  it, 9.85:1, and the muted text turns light, 13.31:1 on the page and
  12.01:1 on the card; in light mode
  the muted grey is a shade darker, 4.53:1 on the page and 4.56:1 on the
  notices' alerts at the least. Built from `@nxgt/mail-ui` 0.7.0 and
  `@nxgt/mail-presets` 0.4.3; the text parts, subjects and variables are
  unchanged, the manifest is still format 1, and the `@nxgt/mail` peer stays
  `>=0.1.0 <1`.
- **The welcome e-mail, v0.4.0.** `welcome(to)`, built from
  `@nxgt/mail-presets` 0.4.2's `welcome` in English and French — "Welcome,
  Ada" — with a **Get started** button linking to the new
  `links.getStarted()`: send it on `@nxgt/janus`'s `user.created` event.
  `links` now requires `getStarted`, and a locale beyond `en` and `fr` takes
  eight templates.

- **A sign-in code box that is not a light slab in dark mode, v0.3.2.** Under
  dark mode the code's box is a mid slate, 6.95:1 against the dark card, with
  the near-black code at 7.76:1 on it, and the page behind the card is darker
  again; light mode, the text parts, subjects and variables are unchanged.
  Built from `@nxgt/mail-ui` 0.6.0 and `@nxgt/mail-presets` 0.4.2; the
  manifest is still format 1, and the `@nxgt/mail` peer stays `>=0.1.0 <1`.
- **A button that shows in dark mode, v0.3.1.** Under dark mode the button
  is near-white with near-black text, no longer a near-black one that all but
  vanished on the dark card; light mode, the text parts, subjects and
  variables are unchanged. Built from `@nxgt/mail-ui` 0.5.0,
  `@nxgt/mail-presets` 0.4.1 and `@nxgt/mail-i18n` 0.6.0; the manifest is
  still format 1, and the `@nxgt/mail` peer stays `>=0.1.0 <1`.
- **The two-factor notices, v0.3.0.** `twoFactorEnabled(to)` and
  `twoFactorDisabled(to)`, built from `@nxgt/mail-presets` 0.4.0's
  `two-factor-enabled` and `two-factor-disabled` in English and French, each
  linking to `links.secureAccount()`: send them on `@nxgt/janus` 0.9's
  `user.secondFactorEnabled` and `user.secondFactorDisabled` events. Seven
  e-mails now, and seven templates to pass for a locale beyond `en` and `fr`.
