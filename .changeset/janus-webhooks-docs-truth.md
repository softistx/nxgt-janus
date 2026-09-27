---
"@nxgt/janus-webhooks": patch
---

Docs: the README gains a Subpaths section and states the `@nxgt/janus` peer as 0.8.5 or a later 0.8. The queues guide and the troubleshooting entry for events lost on exit name `@nxgt/janus-webhooks-redis` as the Redis queue. The reason a retry delay past 24 days is refused now matches the worker, which caps the timer: such a retry would be sent early, not at once.
