---
"@nxgt/janus-mail": patch
---

`newSignIn`'s e-mail text changes in two places:

- **Its text part gives each row of the summary on one line** — `Device Firefox on macOS`, `Location Lyon, France`, `Time …`, one row per line with no blank line between — where it split each row into a label line and a value line. Built with `@nxgt/mail-config` 1.0.2 and `@nxgt/mail-presets` 1.1.1; the manifest stays format 1, and every other e-mail reads as before.
- **A new sign-in sent without `location` says "Unknown location"**, "Lieu inconnu" in French, in the recipient's locale, where it showed `—`. A locale beyond `en` and `fr`, sent through templates of your own, gets its language's text when that is `en` or `fr`, else "Unknown location": pass `location` yourself there.
