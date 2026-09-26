---
'@nxgt/janus': minor
---

A user type may also be an object type. `defineModel` no longer refuses `staff` under `types`. A staff member is then asked `can()`, granted relations and listed like any object; who may edit them is a relation on them.

`setOf(user, relation)` is new, exported from `@nxgt/janus` with its type `SetOf` and the predicate `isSetOf`. It is the one way to write a subject set on such a type: `grant(note, 'readers', setOf(bob, 'managers'))`. A spread of a set keeps its mark; `JSON` and `structuredClone` drop it.

- A user passed as it is stays that user, even with a field named `relation`. On such a type, `{ type: 'staff', id, relation }` written out is a compile error.
- A set on a user type the model does not declare under `types` is refused by `can()`, `list()`, `grant()` and `revoke()`, and by the compiler first.
- `parseSubject` and `parseTuple` now answer a set as `setOf` makes it: frozen and marked. Compare one with `setOf(…)` or through `formatSubject`, not with a plain `{ type, id, relation }`.
- A set passed where a relation admits only the entity is now refused at compile time, as it already was at run time.
