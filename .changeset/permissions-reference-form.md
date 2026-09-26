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
