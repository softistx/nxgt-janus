---
'@nxgt/janus': minor
---

`verifyEmail.proveFirst` retries once when a write lands between its read and the proof (`VERSION_CONFLICT`), instead of failing at once: it reads the user again, answers `{ proved: false }` when that write proved the e-mail, and proves under the new version otherwise. It still throws `VERSION_CONFLICT`, with nothing proved, when the e-mail address changed meanwhile (the proof the caller holds is for the address it read) or when the retry conflicts too, and `USER_INACTIVE` when the user was deactivated between the attempts. Running the proof twice is harmless: the first attempt writes and sends nothing. A caller that retried by hand on `VERSION_CONFLICT` can keep doing so; one that treated it as a failure of the first write now sees it far less often.
