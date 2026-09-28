---
'@nxgt/janus': minor
---

`auth.secondFactor.recoveryCodesLeft(user)` answers how many recovery codes the user still holds: the count `recover` answers as `recoveryCodesLeft`, read again for whoever did not see that answer. A `user.recoveryCodeUsed` listener names the user only, so it can now tell the user how many codes remain:

```ts
if (event.type === 'user.recoveryCodeUsed') {
	const left = await auth.secondFactor.recoveryCodesLeft(event.userId); // 9
}
```

It answers `null` for a user with no active factor — none, or one still waiting for its first code — and `0` for an active factor whose codes are all spent. An unknown id is `NOT_FOUND`, and a store that fails throws `STORE_FAILED`. It writes nothing and needs no key. Using the answer as a `number` without checking for `null` is a compile error, which brings the refusal count to 124.
