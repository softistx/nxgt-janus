# Roadmap

Where `@nxgt/janus-mail` is heading. A direction, not a commitment: there are
no dates here, and the version something shipped in is the only number.

## Now

- **The first release** — the five e-mails of `@nxgt/janus`'s flows, in
  English and French, over any `@nxgt/mail` transport: `janusMail()` and
  `janusTemplates()`. Built and tested in the repository, not yet published.

## Next

- **The other presets** — `magic-link`, `new-sign-in`, `welcome` and
  `invitation` from `@nxgt/mail-presets`, each once `@nxgt/janus` has a flow
  that sends it: a sign-in link, a sign-in from a new device, a user created,
  an invitation to a user type.
- **The expiry in the e-mail** — "the link expires in 24 hours", from the
  flow's `expiresAt`, once the presets' messages take it.

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
  it can see it; hand a send to a queue that retries a `MAIL_FAILED`.
- **Sending from inside `janus()`** — `@nxgt/janus` stays free of e-mail:
  its flows answer what to send, and this package is called with that answer.
  An application that sends its own way needs neither this package nor a
  hook to turn off.
- **The challenge in an e-mail** — a sign-in code e-mail carries the code and
  never the challenge, not even through an override.

## Shipped

Nothing yet: the package is private until its first release.
