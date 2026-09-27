# @nxgt/janus-mail

## 0.1.0

### Minor Changes

- [#97](https://github.com/softistx/nxgt-janus/pull/97) [`9f196da`](https://github.com/softistx/nxgt-janus/commit/9f196da2edcd9231fdc3a21a5f928fa085bf5ab4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: the e-mails of `@nxgt/janus`'s flows — e-mail verification, password reset, sign-in code, and the notices *password changed* and *e-mail changed* — in English and French, sent through any `@nxgt/mail` transport. `janusMail({ mailer, from, brand, links })` takes what each flow answers, as it answers it; `janusTemplates()` answers the five default templates, without a mailer. The e-mails are built with Maizzle when this package is built and shipped in `mails/`, so your server only fills them in — your brand, the recipient's name, your links, every value escaped — with no template engine. Any one of them can be your own function, and a send rejects with the mailer's own `MailFailure` or `MailRefused`. Peers: `@nxgt/mail` 0.1 or later below 1, `@nxgt/janus` 0.8, and `typescript` 6. Keep the package external to your server bundle, so `mails/` is deployed with it.

### Patch Changes

- Updated dependencies [[`9f196da`](https://github.com/softistx/nxgt-janus/commit/9f196da2edcd9231fdc3a21a5f928fa085bf5ab4)]:
  - @nxgt/janus@0.8.8
