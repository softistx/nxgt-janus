---
"@nxgt/janus": minor
---

`defineModel` accepts the model written the way Keto's OPL reads: `related` and the `permits` names on the type, the rules beside the types as functions given **typed references** — `related.owners`, `permits.manage`, `related.parents.permits.view`, `when(related.owners, test)`. Your editor completes them from the names declared on the types.

```ts
defineModel({
  subjects: auth.types,
  types: {
    folder: { related: { owners: ['staff'] }, permits: ['view'] },
    document: { related: { owners: ['staff'], parents: ['folder'] }, permits: ['view', 'edit'] },
  },
  rules: {
    folder: { view: ({ related }) => [related.owners] },
    document: {
      view: ({ related, permits }) => [related.owners, related.parents.permits.view, permits.edit],
      edit: ({ related }) => [when(related.owners, (ctx: { locked: boolean }) => !ctx.locked)],
    },
  },
});
```

**Nothing changes for a model written with `relations` and `permissions` strings**: it is still accepted, still typed the same, and the two spellings can share one model. A rule function is called once, when the model is defined, and spelled out into the string form; `ConfigOf` on such a model answers that string form.

One type takes one form: `related` beside `permissions`, or `relations` beside `permits`, is refused — at compile time, and with a `TypeError` from JavaScript. `rules` is required once a type declares `permits`, and a rule answers a non-empty list. A permit declared twice, or named like a relation of its type, is a compile error. A type may have `related` alone — a team others point at through `team#members` — and needs no rules.

In the string form, one check moves earlier: an arrow through a relation that can hold a subject set (`teams: ['team', 'team#members']`, then `'teams->view'`) was refused by `defineModel` when it ran, and is now a compile error too.

One message changes text for everyone: an unknown key on an object type now reads `types.<type>.<key> is not a key of an object type: relations or permissions — related or permits`.

`model.definition` is the model in the string form, as its type always said: for a model written with references, its rules spelled out (`permissions: { view: ['owners'] }`), never `related`, `permits` or `rules`. It is a copy whose top level is frozen — `types` beneath it is not — for a string-form model too, which no longer answers the very object passed in.
