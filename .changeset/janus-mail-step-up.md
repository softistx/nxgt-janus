---
"@nxgt/janus-mail": minor
---

The step-up's e-mail: `mail.stepUp(issued, to, options?)` sends what `@nxgt/janus`'s `auth.stepUp.request(user)` answered, once narrowed to `via: 'email'`, to `issued.email`. It is built from `@nxgt/mail-presets` 1.1.0's `confirm-action`, in English and French: "Your confirmation code" / "Votre code de confirmation", a greeting by `to.name`, the code, how long it lasts, read from `issued.expiresAt` — "This code expires in 10 minutes." — and a **Secure my account** button to `links.secureAccount()`, for a user who asked for nothing. The message names no action.

```ts
const issued = await auth.stepUp.request(current.user);
if (issued.via === 'email') await mail.stepUp(issued, { name: current.user.name, locale: current.user.locale });
```

- `to` is required, unlike `signInCode`'s: the e-mail greets the user by name. It reads `via`, `code`, `email` and `expiresAt` only — never the challenge.
- A step-up confirmed with the user's app (`via: 'secondFactor'`) sends nothing: un-narrowed, the answer is a compile error, and in JavaScript a `TypeError` — `janusMail.stepUp: via must be 'email' — a step-up confirmed with the user's app sends no e-mail` — before anything is rendered. Six new compile-time refusals: 46.
- **Breaking for a locale beyond `en` and `fr`: `templates` must include `stepUp`.** Eleven templates now, and with such a locale every one is yours — a `templates` written for 0.7 is a compile error (`Property 'stepUp' is missing`), and a `TypeError` in JavaScript, until it has one. It is given `brand`, `name`, `code`, `expiresIn` and `link`. With `en` and `fr` only, `templates` stays partial and nothing changes.
- **Breaking for an exhaustive `switch` over `JanusMailTemplateName`**, which gains `'stepUp'`.
- The package builds eleven e-mails, from `@nxgt/mail-presets` 1.1.0; the manifest is still format 1, so the `@nxgt/mail` peer stays `>=0.1.0 <2`.
