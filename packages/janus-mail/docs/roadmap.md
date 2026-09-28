# Roadmap

Where `@nxgt/janus-mail` is heading. A direction, not a commitment: there are
no dates here, and the version something shipped in is the only number.

## Now

Nothing between releases.

## Next

- **The other presets** — `magic-link`, `new-sign-in`, `welcome` and
  `invitation` from `@nxgt/mail-presets`, each once `@nxgt/janus` has a flow
  that sends it: a sign-in link, a sign-in from a new device, a user created,
  an invitation to a user type.
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
  a mailer wrapped in `@nxgt/mail` 0.8's `withRetry`.
- **Sending from inside `janus()`** — `@nxgt/janus` stays free of e-mail:
  its flows answer what to send, and this package is called with that answer.
  An application that sends its own way needs neither this package nor a
  hook to turn off.
- **The challenge in an e-mail** — a sign-in code e-mail carries the code and
  never the challenge, not even through an override.

## Shipped

Newest first; from the first release on, the package's CHANGELOG holds every one.

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
- **Dark mode, v0.3.0.** The e-mails follow the reader's dark mode in
  every client that supports it, Gmail excepted: a dark page, a dark card and
  light text. Built from `@nxgt/mail-ui` 0.4.0, `@nxgt/mail-presets` 0.4.0
  and `@nxgt/mail-i18n` 0.5.0; the text parts, subjects and variables are
  unchanged, the manifest is still format 1, and the `@nxgt/mail` peer stays
  `>=0.1.0 <1`.

- **The expiry in the e-mail, v0.2.0.** The verification, reset and sign-in
  code e-mails say how long the link or code lasts — "1 hour", "1 heure" —
  derived from the flow's `expiresAt` in the recipient's locale, measured
  against `janusMail({ clock })` (the clock given to `janus()`), or given per
  send as `{ expiresIn }`. Two breaks: a template called directly takes
  `expiresIn`, and `signInCode` reads `issued.expiresAt`. Built from
  `@nxgt/mail-presets` 0.2.0, whose text parts keep each paragraph on one
  line.

- **The first release, v0.1.0.** The five e-mails of `@nxgt/janus`'s flows,
  in English and French, over any `@nxgt/mail` transport: `janusMail()` and
  `janusTemplates()`. Built with Maizzle when the package is built, shipped
  in `mails/`, and only filled in at send time, every value escaped.
