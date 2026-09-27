---
"@nxgt/janus-mail": patch
---

The `TypeError` for a locale that `Intl` rejects now reads `janusMail: locales must be BCP 47 language tags, as 'fr-CA'`. The words "with hyphens" are gone: they misled for `i-klingon` or `x-foo`, which already hold hyphens and are refused anyway. The check itself is unchanged. Code that matches the old message text must match the new one.
