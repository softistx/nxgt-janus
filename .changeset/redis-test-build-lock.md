---
---

The Redis that the `janus-redis`, `janus-webhooks-redis` and `janus-kit` specs compile is built under a lock, so suites started at once, as the root `test` starts them, build it once instead of colliding.
