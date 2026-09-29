---
"@nxgt/janus-hono": minor
---

The device cookie: `deviceOf(c, options?)` reads it for a sign-in's `device`, and `sendSession` sets it — or sets it again, for another `maxAge` — whenever the answer carries a `deviceToken`.

```ts
const signedIn = await auth.signIn({ email, password }, { device: deviceOf(c) });
const user = sendSession(c, auth, signedIn);
```

- `sendSession(c, auth, signedIn, { device })` and `DeviceCookieOptions`: `janus-device` (`DEVICE_COOKIE`), HttpOnly, Secure, `SameSite=Lax`, `Path=/`, 400 days. Give `deviceOf` the same options. `signOut` leaves it: the device stays known.
- Two new compile-time refusals: 28.
