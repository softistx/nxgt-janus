---
"@nxgt/janus-mongo": patch
---

Docs: the README gains "Type safety, counted": nine plausible mistakes the compiler refuses — a connection string, `@nxgt/mongo`'s connection or the driver's client instead of a database, a sync option in the wrong case, and the adapter or one of its stores passed where another is expected — each measured by a `@ts-expect-error` case in `test/types/adapter.ts`.
