---
"@nxgt/janus-mongo": patch
---

`createMongoAdapter(db)` answers `{ store, relations }`, the keys `janus()` takes them under: `janus({ …, ...createMongoAdapter(db) })` wires the identity stores and the relation store in one spread, so deleting a user deletes their tuples without a second wiring. `syncMongoAdapter(db)` syncs the four collections in one deployment step. `createMongoStores` and `createMongoRelations` stay, for one side alone.
