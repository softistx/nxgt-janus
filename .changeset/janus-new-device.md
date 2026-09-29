---
"@nxgt/janus": minor
---

A sign-in from a new device: janus tells it apart, with a device token it signs and the app keeps in a long-lived cookie — nothing is stored, and the store ports are unchanged.

```ts
const auth = janus({ /* … */, devices: { keys: [{ id: '2026-09', key: process.env.DEVICES_KEY }] } });

const signedIn = await auth.signIn({ email, password }, { device: cookie ?? null });
if (signedIn.status === 'signedIn') {
  // keep signedIn.deviceToken in the device cookie; signedIn.newDevice says whether to send a notice
}
```

- `janus({ devices: { keys } })` (type `DevicesConfig`): the first key signs, every key checks, in `secondFactor.keys`'s format. A token signed by an older key is known and handed back re-signed with the first. **Removing a key is the only way to forget devices, and it forgets every device that key signed.**
- `SignInOptions { device?: string | null }`, the last optional argument of `signUp`, `signIn`, `secondFactor.confirm`, `secondFactor.recover`, `signInCode.confirm` and `magicLink.confirm`: the token the client holds, or `null` when it holds none. Absent, devices are not tracked for that call. The challenge of a second factor carries no device: give it again to `secondFactor.confirm` or `recover`. The step-up never counts.
- Every answer that opens a session carries `newDevice` and `deviceToken`. `signUp` mints the first token and is never new. A malformed, forged, another user's or a forgotten key's token is a new device, never an error.
- A new event, `user.newDeviceSignedIn`, carrying the new session's `sessionId`, sent once the sign-in is complete.
- A device given to a `janus()` without `devices`, or a device neither a string nor `null`, is a bare `TypeError` before anything is written. Six new compile-time refusals: 147.
- **Breaking for an exhaustive `switch` over `UserEventType`, which gains `'user.newDeviceSignedIn'`. With `@nxgt/janus-webhooks`, upgrade receivers first.**
- **Breaking for a `SignedIn` built by hand (a test double): it needs `newDevice` and `deviceToken`.**
