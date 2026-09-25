# Permissions — `@nxgt/janus/permissions`

This page is for modelling who may do what, and asking: `defineModel`,
`fromField`, `when`, then `can`, `list`, `grant` and `revoke`. It is
Zanzibar's model — relations between objects and subjects, permissions
computed from them — **without its infrastructure**: the tuples live in your
database, so a read follows a write and there is nothing to cache.

It is the **permissions** side, and it is usable alone: the example below wires
it to `janus()` so the user types become the subjects, but `subjects` takes
any list of names — `defineModel({ subjects: ['user'], … })` — when your users
live elsewhere. Importing `@nxgt/janus/permissions` loads no identity code.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { createMemoryRelations, defineModel, permissions } from '@nxgt/janus/permissions';

const relations = createMemoryRelations();

const auth = janus({
	users: {
		staff: { schema: z.object({ username: z.string() }), password: { login: 'username' } },
	},
	store: createMemoryStores(),
	relations, // deleting a user deletes every tuple naming them
	hasher: scryptHasher(),
});

const model = defineModel({
	subjects: auth.types, // 'staff': a user type is a subject type
	types: {
		team: {
			relations: { member: ['staff', 'team#member'], lead: ['staff'] },
			permissions: { manage: ['lead'], view: ['member', 'manage'] },
		},
	},
});

const access = permissions({ model, store: relations });

const grace = await auth.staff.create({ username: 'grace' });
const team = { type: 'team', id: 't1' } as const;

await access.grant(team, 'lead', grace);
await access.can(grace, 'view', team);   // true: view includes manage, which includes lead
await access.revoke(team, 'lead', grace);
await access.can(grace, 'view', team);   // false
```

## The model

```ts
function defineModel<
	const Subjects extends readonly string[], // auth.types
	const Ts extends ModelConfig['types'] & ModelTypesOf<Subjects[number], Ts>, // what your editor completes
>(config: { readonly subjects: Subjects; readonly types: Ts }): PermissionModel<{ readonly subjects: Subjects; readonly types: Ts }>;
// ModelTypesOf<S, Ts>: the names each relation and rule of each type may take

interface ModelConfig {
	readonly subjects: readonly string[]; // pass auth.types
	readonly types: {
		readonly [objectType: string]: {
			readonly relations?: { readonly [name: string]: readonly string[] | FromField };
			readonly permissions?: { readonly [name: string]: readonly (string | When)[] };
		};
	};
}
```

**A relation** lists who may hold it:

| Holder | Means |
| --- | --- |
| `'staff'` | one user of type `staff` |
| `'team'` | one object of type `team` — what an arrow follows |
| `'team#member'` | a **subject set**: every member of a team |
| `fromField('doctorId', 'staff')` | read from the object's own data — see [`fromField`](#fromfield) |

**A permission** is the union of its rules:

| Rule | Means |
| --- | --- |
| `'member'` | a relation of the same object |
| `'manage'` | another permission of the same object |
| `'team->view'` | an **arrow**: whoever holds `view` on the object's `team` |
| `when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)` | a rule under a condition — see [`when`](#when) |

A rule may name another permission of the same type — `view: ['member',
'manage']` — but never the permission itself: `view: ['view']` adds nothing
and is a loop no relation ends, so your editor does not offer it and the
compiler refuses it. A loop through another permission (`view: ['edit'],
edit: ['view']`) is refused by `defineModel` when it runs.

A permission may be asked of `can` and `list` like a relation, and a relation
like a permission.

### What the compiler refuses

A relation naming a type that does not exist, a rule naming nothing, an arrow
to a permission its target lacks, a name that is both a relation and a
permission: each is a compile error **on the offending name** — on the whole
`fromField(…)` or `when(…)` call for those two. Except for that last one,
which says to rename one, the error lists what you could have written, with
"Did you mean" when one is close.

Your editor offers those names as you type — subject types and subject sets
in a relation, subject types in `fromField`, relations, permissions and arrows
in a rule and in `when` — because `defineModel` types its `types` with a
constraint an editor reads, not only with a check. A spec asks the TypeScript
language service what it completes, so a change that loses it fails.

```ts
defineModel({
	subjects: ['staff'],
	types: {
		team: {
			// @ts-expect-error — Type '"staf"' is not assignable to type '"staff" | "team" | "team#member"'. Did you mean '"staff"'?
			relations: { member: ['staf'] },
		},
	},
});
```

### What `defineModel` refuses at run time

With a `TypeError`, when the model is defined — never at a check:

- a name that is not camelCase;
- an object type named like a user type;
- a permission that reaches itself without crossing a relation (`view:
  ['edit'], edit: ['view']`) — no data could ever end that loop;
- a subject set or an arrow that would have to read **another** object's
  `fromField` — only the object passed to `can()` carries its data. Store that
  relation instead.

A loop that crosses a relation — a folder viewable through its parent — is
fine: the data ends it.

## `fromField`

```ts
function fromField(field, subjectType): FromField;
function fromField(field, subjectType, { lookup }): ReversibleFromField;
type Lookup = (subjectId: string) => Promise<readonly string[]>;
```

A relation read from the object's own data — a record's `doctorId` — rather
than a tuple kept in sync with it. Nothing is stored, and `grant` refuses it at
compile time. `can()` is given the object, and the compiler requires every
field a `fromField` of its type reads:

```ts
const model = defineModel({
	subjects: ['staff'],
	types: {
		record: {
			relations: { doctor: fromField('doctorId', 'staff') },
			permissions: { view: ['doctor'] },
		},
	},
});
const access = permissions({ model, store: createMemoryRelations() });

const record = { id: 'r1', doctorId: grace.id, title: 'Chart' }; // as your database answered it
await access.can(grace, 'view', { type: 'record', ...record });
```

**Spread the loaded object.** A field missing at run time is a `TypeError`,
never a denial. `null` in the field holds nobody.

`list()` cannot read a field of objects it has not found, so it asks `lookup`
for the ids of the objects whose field names the subject. A `list()` that would
reach a `fromField` without one is a compile error:

```ts
fromField('doctorId', 'staff', { lookup: (staffId) => db.records.ids({ doctorId: staffId }) });
```

A lookup is your code, and it is not guarded: one that throws rejects `list()`
with its own error. **Never answer `[]` for a database that could not answer**
— that is a denial made of an outage.

## `when`

```ts
function when<const Rule extends string, Ctx>(rule: Rule, test: (ctx: Ctx) => boolean): When<Rule, Ctx>;
```

Puts a condition written in TypeScript on a rule — any rule of the same type:
a relation, a permission, an arrow. The test is synchronous and pure: it
decides on what the caller passes, and reads nothing. Its `ctx` is what `can()`
and `list()` then **require**, and only for the permissions whose rules reach
it:

```ts
const model = defineModel({
	subjects: ['staff'],
	types: {
		record: {
			relations: { doctor: fromField('doctorId', 'staff') },
			permissions: {
				edit: [when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)],
			},
		},
	},
});
const access = permissions({ model, store: createMemoryRelations() });

await access.can(grace, 'edit', { type: 'record', ...record }, { ctx: { onShift: true } });
// @ts-expect-error — ctx is required: edit reaches a condition
await access.can(grace, 'edit', { type: 'record', ...record });
```

## `permissions()`

```ts
function permissions<C extends ModelConfig>(options: PermissionsOptions<C>): Permissions<C>;
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `model` | `PermissionModel` | — | What `defineModel` answered |
| `store` | `RelationStore` | — | Where tuples live: `createMemoryRelations()` in tests, `createMongoRelations(db)` from `@nxgt/janus-mongo` |
| `maxDepth` | positive integer | `25` | How many relations a check may cross. Past it: `PERMISSION_DEPTH` |

It connects to nothing, and refuses a store missing a method with a
`TypeError`.

### `can`

```ts
can(subject, permission, object, options?): Promise<boolean>;
```

- `subject` is a user from `janus()` as it is — any object with `type` and
  `id` — an object of the model, or `null` for anonymous, which answers `false`
  before any store call.
- `permission` must be a relation or a permission of the object's type.
- `object` is `{ type, id }` plus every field its `fromField`s read.
- `options.ctx` is required exactly when a `when` is reachable.

Your editor completes `permission` with the names of the object's type once
the object is written. **Before, it offers the names of every type**: the
permission comes before the object, and nothing yet says which type it is. A
relation named after a type — `team: ['team']` — is offered as a name; it is
the relation, not the type.

```ts
await access.can(grace, 'view', { type: 'record', ...record });                               // true
await access.can(grace, 'edit', { type: 'record', ...record }, { ctx: { onShift: false } });   // false
await access.can(null, 'view', { type: 'record', ...record });                                // false, no store call
```

**A denial is `false`; a failure throws.** A store that cannot answer is
`STORE_FAILED`; a walk past `maxDepth` is `PERMISSION_DEPTH`. Neither is ever
`false`, which would deny everybody everything during an outage and say
nothing. A cycle in the data — a team member of itself — is cut, and is not an
error.

### `list`

```ts
list(subject, permission, objectType, options?): Promise<CursorPage<string>>;
```

The ids of the objects of `objectType` on which `subject` holds `permission`,
ascending, by pages — what `can()` answers `true` for, found without naming
them.

```ts
const page = await access.list(grace, 'view', 'record', { limit: 50 });
page.items;      // readonly string[]
page.nextCursor; // string | null
await access.list(grace, 'view', 'record', { after: page.nextCursor, limit: 50 });
```

`limit` is 20 by default and at most 100; `ctx` is required as for `can`.
Your editor completes `permission` with what `list()` can answer only: a name
reaching a `fromField` with no `lookup` is neither offered nor accepted.
`null` answers an empty page before any store call.

`list()` walks backwards from the subject, reading every page of the reverse
index for every id each step reaches. That is fine for what one user can see,
and not for a subject set holding most of the database — write a query of your
own for that.

### `grant` and `revoke`

```ts
grant(object, relation, subject): Promise<void>;
revoke(object, relation, subject): Promise<void>;
```

Both are typed from the model: only a stored relation (never a `fromField`),
and only a holder the relation admits.

The same rule holds when reading: `can()` and `list()` follow only the holders
a relation admits. A tuple stored past `grant()` — by an older model, or by
hand — that the model does not admit grants nothing. `revoke()` refuses it as
it refuses to `grant()` it, so remove it with the store:

```ts
await relations.write({
	remove: [
		{
			object: { type: 'record', id: 'r1' },
			relation: 'viewer',
			subject: { type: 'team', id: 't1' },
		},
	],
});
```

Narrowing a model therefore hides the tuples it no longer admits; it does not
delete them, and widening it again brings them back.

```ts
await access.grant({ type: 'team', id: 't1' }, 'member', grace);
await access.grant({ type: 'team', id: 't1' }, 'member', { type: 'team', id: 't2', relation: 'member' }); // a subject set
await access.grant({ type: 'record', id: 'r1' }, 'team', { type: 'team', id: 't1' });                  // what 'team->view' follows
await access.revoke({ type: 'team', id: 't1' }, 'member', grace);
```

Both are idempotent: granting what is held, or revoking what is not, is not an
error. Each writes one tuple.

### Deleting

Wire the relation store into `janus({ relations })`, and deleting a user
deletes every tuple naming them. Deleting an object's tuples is yours, from
your own code, when you delete the object:

```ts
await relations.deleteEntity({ type: 'record', id: 'r1' }); // answers how many tuples it removed
```

## A route guard

```ts
import { PermissionDepthError, StoreFailure } from '@nxgt/janus';

export async function getRecord(request: Request, id: string): Promise<Response> {
	try {
		const current = await auth.authenticate(request, { type: 'staff' });
		const record = await loadRecord(id);
		if (record === null) return new Response(null, { status: 404 });

		const allowed = await access.can(current?.user ?? null, 'view', { type: 'record', ...record });
		if (!allowed) return new Response(null, { status: current ? 403 : 401 });
		return Response.json(record);
	} catch (error) {
		if (error instanceof StoreFailure) return new Response(null, { status: 503 });
		if (error instanceof PermissionDepthError) return new Response(null, { status: 500 });
		throw error;
	}
}
```

## Subjects and the notation

A user **is** a subject: `subjectOf(user)` from `@nxgt/janus` answers its
`{ type, id }`, and `can` takes the user as it is. Tuples print in Zanzibar's
notation, typed — see [the shared vocabulary](vocabulary.md#subjects-and-the-tuple-notation).

## The relation store

`RelationStore` is six methods answering one-hop questions about stored tuples
— `write`, `has`, `findSubjectSets`, `findEntities`, `findObjects`,
`deleteEntity`. The traversal is the core's. `createMemoryRelations()` is the
reference implementation, and [Writing an adapter](adapters.md) covers the
rest.

## See also

- [Users](users.md) — `janus({ relations })`, and user types as subject types
- [Errors](errors.md) — `STORE_FAILED` and `PERMISSION_DEPTH`
- [Writing an adapter](adapters.md) — `RelationStore` and its conformance suite
