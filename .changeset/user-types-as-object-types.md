---
'@nxgt/janus': minor
---

A user type may also be an object type. `defineModel` no longer refuses `staff` under `types`: a staff member is asked `can()`, granted relations and listed like any object — who may edit them is a relation on them. `setOf(user, relation)`, exported from `@nxgt/janus` with its type `SetOf`, is the one way to write a subject set on such a type: `grant(note, 'readers', setOf(bob, 'managers'))`. A user passed as it is stays that user, even with a field named `relation`; `{ type: 'staff', id, relation }` written out is a compile error there, and `setOf` on a user type the model does not declare under `types` is refused. A set passed where a relation admits only the entity is now refused at compile time too, as it already was at run time.
