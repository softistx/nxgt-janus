---
'@nxgt/janus-telemetry': patch
---

The audit trail records a subject as `permissions()` reads it. `janus.subject.relation` was set whenever the subject had a `relation` field, so a user with such a field was logged as a subject set that was never stored. It is now set only for a real set: one `setOf()` made, or `{ type, id, relation }` on an object type. The user types come from the instance's `model`. Needs `@nxgt/janus` 0.3.0, for `isSetOf`.
