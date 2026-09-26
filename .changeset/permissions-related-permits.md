---
"@nxgt/janus": minor
---

**Breaking: an object type's keys are `related` and `permits`**, Keto's OPL words — `relations` and `permissions` are renamed, nothing else changes. Rules stay strings, typed and completed by your editor as before.

```ts
defineModel({
  subjects: auth.types,
  types: {
    team: {
      related: { members: ['staff', 'team#members'], leads: ['staff'] },
      permits: { manage: ['leads'], view: ['members', 'manage'] },
    },
    record: {
      related: { doctors: fromField('doctorId', 'staff'), teams: ['team'] },
      permits: {
        view: ['doctors', 'teams->view'],
        edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
      },
    },
  },
});
```

**Migrating**: rename the two keys on every object type — `relations:` → `related:`, `permissions:` → `permits:`. The old keys are refused, at compile time (`team.relations is now related: rename the key`) and with a `TypeError` from JavaScript (`defineModel: types.team.relations is now related: rename the key`). Plural relation names — `members`, `owners`, `teams` — are the convention of the docs, not a rule; `can`, `list`, `grant` and `revoke` take the names you declare.

Run-time messages name the new keys: `types.<type>.related.<relation>`, `types.<type>.permits.<permission>`. An arrow through a relation that can hold a subject set (`teams: ['team', 'team#members']`, then `'teams->view'`) was refused by `defineModel` when it ran; it is now a compile error too.
