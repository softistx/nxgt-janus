---
"@nxgt/janus-mail": minor
---

The new sign-in notice: `mail.newSignIn(to, { device, time, location? })`, built from `@nxgt/mail-presets`' `new-sign-in`, in English and French — "New sign-in to your account" / "Nouvelle connexion à votre compte", the device, where, when, and a button to `links.secureAccount()`. Send it when a janus sign-in answers `newDevice: true`, or on `user.newDeviceSignedIn`.

```ts
if (signedIn.newDevice) await mail.newSignIn({ name, email, locale }, { device: 'Firefox on macOS', time });
```

- Every value is the app's text in the recipient's locale; janus sees no IP, so `location` is the app's to compute. Left out, the e-mail shows `—`. Four new compile-time refusals: 50.
- **Breaking for a locale beyond `en` and `fr`: `templates` must include `newSignIn`.** Twelve templates now. With `en` and `fr` only, nothing changes.
- **Breaking for an exhaustive `switch` over `JanusMailTemplateName`**, which gains `'newSignIn'`.
