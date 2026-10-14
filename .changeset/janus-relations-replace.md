---
'@nxgt/janus': minor
---

Add `replace(object, relation, subjects)` to `permissions()`: it makes `subjects` the only holders of a relation on an object, reading the current holders and writing the difference in one `write` (none when nothing changes), and answers `{ added, removed }`, the `RelationTuple[]` added and the `RelationTuple[]` removed. The subjects are typed and checked exactly as `grant()`'s, so a refusal anywhere in the list writes nothing; `[]` removes every holder, duplicates count once, and a subject set is not its entity. Two concurrent calls on the same object and relation are not serialised and can leave the union of both adds. The `RelationStore` port is unchanged, but `replace` reads every holder of the relation through `findEntities` and `findSubjectSets`, so an adapter must answer them all and never cap.
