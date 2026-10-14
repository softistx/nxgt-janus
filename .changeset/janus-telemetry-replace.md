---
'@nxgt/janus-telemetry': minor
---

`instrumentPermissions` traces `replace` like `grant` and `revoke`: a `janus.replace` span carrying the object and `janus.relation`, and one `janus.tuple.granted` audit event per tuple it added and one `janus.tuple.revoked` per tuple it removed, with the attributes `grant` and `revoke` write (a subject set also carries `janus.subject.relation`). Nothing is written when `replace` changes nothing or fails. `PermissionsLike` gains an optional `replace`. Also documents that `janus.<type>.findOrCreate` is traced like `findByEmail`: the span carries the user type and never the key.
