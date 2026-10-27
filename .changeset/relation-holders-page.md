---
"@nxgt/janus": minor
"@nxgt/janus-mongo": minor
"@nxgt/janus-drizzle": minor
---

`access.holders(object, relation, { first, after, search, matches })` lists the single entities holding a relation on an object, by cursor pages ordered by type then id, optionally filtered by a text their id contains or by a predicate (for the holder's email or name, read from the user store). The `RelationStore` port gains an optional `findHolders(request)`, so a store without it keeps working: the core pages `findEntities` in memory. `createMongoRelations` and `createDrizzleRelations` implement it in the database, the reference store implements it, and the relation conformance suite checks it when present. `HolderPageRequest`, `holderCursor`, `readHolderCursor`, `pageOfHolders` and `idMatches` are exported from `@nxgt/janus/permissions` for adapter authors.
