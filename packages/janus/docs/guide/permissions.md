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

## The running example: a clinic

Every snippet on this page uses this model, and only its names. Two sections
need something else and say so: a [folder tree](#a-hierarchy) and
[permissions on a user](#permissions-on-a-user).

```ts
import { z } from 'zod';
import { createMemoryStores, type CursorPage, janus, scryptHasher } from '@nxgt/janus';
import { createMemoryRelations, defineModel, fromField, permissions, when } from '@nxgt/janus/permissions';

const relations = createMemoryRelations();

const auth = janus({
	users: {
		staff: { schema: z.object({ username: z.string() }), password: { login: 'username' } },
		patient: { schema: z.object({ email: z.email() }), password: { login: 'email' } },
	},
	store: createMemoryStores(),
	relations, // deleting a user deletes every tuple naming them
	hasher: scryptHasher(),
});

const model = defineModel({
	subjects: auth.types, // 'staff' | 'patient': a user type is a subject type
	types: {
		team: {
			related: { members: ['staff', 'team#members'], leads: ['staff'] },
			permits: { manage: ['leads'], view: ['members', 'manage'] },
		},
		record: {
			related: {
				doctors: fromField('doctorId', 'staff', { lookup: (staffId) => db.records.idsByDoctor(staffId) }),
				patients: fromField('patientId', 'patient', { lookup: (patientId) => db.records.idsByPatient(patientId) }),
				teams: ['team'],
			},
			permits: {
				view: ['doctors', 'patients', 'teams->view'],
				review: ['teams->leads'],
				edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
			},
		},
	},
});

const access = permissions({ model, store: relations });

const grace = await auth.staff.create({ username: 'grace' }); // a doctor
const ada = await auth.staff.create({ username: 'ada' });     // a team lead
const team = { type: 'team', id: 't1' } as const;
const record = { id: 'r1', doctorId: grace.id, patientId: 'p1', title: 'Chart' }; // as your database answered it
```

`db` is your database; the two `lookup`s answer the ids of the records whose
field names the subject — see [`fromField`](#a-relation-read-from-the-object).

In words: a team has **members** — staff, or every member of another team —
and **leads**; whoever leads it may **manage** it, and members and managers
may **view** it. A record's **doctors** and **patients** are read from its own
fields, its **teams** are stored; its doctors, its patients and whoever can
view one of its teams may **view** it, the leads of its teams may **review**
it, and its doctors may **edit** it while on shift.

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
			readonly related?: { readonly [relation: string]: readonly string[] | FromField };
			readonly permits?: { readonly [permission: string]: readonly (string | When)[] };
		};
	};
}
```

An object type has two keys, Keto's words: **`related`**, who may hold each
relation, and **`permits`**, what each permission is made of. Relation names
are plural by convention — `members`, `doctors`, `teams` — because a relation
holds many; `defineModel` does not enforce it.

**A relation** lists who may hold it:

| Holder | Means |
| --- | --- |
| `'staff'` | one user of type `staff` |
| `'team'` | one object of type `team` — what an arrow follows |
| `'team#members'` | a **subject set**: every member of a team |
| `fromField('doctorId', 'staff')` | read from the object's own data — see [`fromField`](#a-relation-read-from-the-object) |

**A permission** is the union of its rules:

| Rule | Means |
| --- | --- |
| `'members'` | a relation of the same object |
| `'manage'` | another permission of the same object |
| `'teams->view'` | an **arrow**: whoever holds `view` on one of the object's `teams` |
| `'teams->leads'` | an arrow to a relation: whoever leads one of the object's `teams` |
| `when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)` | a rule under a condition — see [`when`](#a-condition) |

A rule may name another permission of the same type — `view: ['members',
'manage']` — but never the permission itself: `view: ['view']` adds nothing
and is a loop no relation ends, so your editor does not offer it and the
compiler refuses it. A loop through another permission (`view: ['edit'],
edit: ['view']`) is refused by `defineModel` when it runs.

A permission may be asked of `can` and `list` like a relation, and a relation
like a permission.

### What the compiler refuses

A relation naming a type that does not exist, a rule naming nothing, an arrow
to a permission its target lacks, an arrow through a relation that can hold a
subject set, a name that is both a relation and a permission, a key other than
`related` and `permits` — `permit:`, singular — on an object type: each is a
compile error **on the offending name** — on the whole `fromField(…)` or
`when(…)` call for those two. Except for the name used twice, which says to
rename one, the error lists what you could have written, with "Did you mean"
when one is close.

```ts
defineModel({
	subjects: ['staff'],
	types: {
		team: {
			// @ts-expect-error — Type '"staf"' is not assignable to type '"staff" | "team" | "team#members"'. Did you mean '"staff"'?
			related: { members: ['staf'] },
		},
	},
});
```

**The keys before 0.2**, `relations` and `permissions`, are refused with the
name that replaced them — rename the key, nothing else changes:

```ts
defineModel({
	subjects: ['staff'],
	types: {
		team: {
			// @ts-expect-error — 'members' does not exist in type 'Refusal<"team.relations is now related: rename the key", never>'
			relations: { members: ['staff'] },
		},
	},
});
```

`permissions:` is refused the same way: `team.permissions is now permits:
rename the key`.

Your editor offers those names as you type — subject types and subject sets
in a relation, subject types in `fromField`, relations, permissions and arrows
in a rule and in `when` — because `defineModel` types its `types` with a
constraint an editor reads, not only with a check. A spec asks the TypeScript
language service what it completes, so a change that loses it fails.

### What `defineModel` refuses at run time

With a `TypeError`, when the model is defined — never at a check. Each names
the key you wrote, `types.record.permits.view` or `types.team.related.members`:

- `relations` or `permissions` — the keys before 0.2 — and any key other than
  `related` and `permits`;
- a name that is not camelCase;
- a permission that reaches itself without crossing a relation (`view:
  ['edit'], edit: ['view']`) — no data could ever end that loop;
- a subject set or an arrow that would have to read **another** object's
  `fromField` — only the object passed to `can()` carries its data. Store that
  relation instead.

A loop that crosses a relation — a folder viewable through its parents — is
fine: the data ends it. See [a hierarchy](#a-hierarchy).

## Use cases

Each case below runs against the clinic above, in order — except the two that
say otherwise: a folder tree for a hierarchy, and staff members who manage
each other for permissions on a user.

### A direct relation

A relation is what you store: `grant` writes it, `can` reads it.

```ts
await access.grant(team, 'leads', ada);
await access.can(ada, 'leads', team);  // true: a relation may be asked like a permission
await access.can(grace, 'leads', team); // false
```

### A permission naming a permission

`view: ['members', 'manage']` includes whoever holds `manage`, which is
`['leads']` — so a lead can view the team without being a member.

```ts
await access.can(ada, 'manage', team); // true: ada leads t1
await access.can(ada, 'view', team);   // true: view includes manage
```

### A subject set

`members: ['staff', 'team#members']` admits a staff member, or **every member
of another team** at once. Grant the set with its `relation`:

```ts
const cardiology = { type: 'team', id: 't2' } as const;
await access.grant(cardiology, 'members', grace);
await access.grant(team, 'members', { type: 'team', id: 't2', relation: 'members' });
await access.can(grace, 'view', team); // true: grace is a member of t2, whose members are members of t1
```

`setOf(cardiology, 'members')`, from `@nxgt/janus`, writes the same set. On an
object type the two are the same; on a user type only `setOf` makes a set —
see [permissions on a user](#permissions-on-a-user).

The set is followed as the data stands: revoke grace from `t2`, and she no
longer views `t1`. A team member of itself — a cycle in the data — is cut, and
is not an error.

### An arrow

`'teams->view'` is **whoever can view one of the record's teams**; the arrow
follows the objects the `teams` relation holds, and asks them `view`. Grant
the record its team, then everyone who views the team views the record:

```ts
await access.grant({ type: 'record', id: record.id }, 'teams', team);
await access.can(ada, 'view', { type: 'record', ...record }); // true: ada views t1 (she leads it)
```

An arrow may end on a relation too: `review: ['teams->leads']` is whoever
**leads** one of the record's teams — not its members.

```ts
await access.can(ada, 'review', { type: 'record', ...record });   // true: ada leads t1
await access.can(grace, 'review', { type: 'record', ...record }); // false: grace is a member, not a lead
```

An arrow follows **object types only**: through a relation that can hold a
subject set (`teams: ['team', 'team#members']`), `'teams->view'` is a compile
error.

### A hierarchy

A folder tree, one of the two models on this page besides the clinic: a folder is
viewable by its owners and by whoever views one of its parents. The arrow
names the folder's own `view` — a loop in the model, which **the data ends**:
the walk stops at a folder with no parents.

```ts
const files = permissions({
	model: defineModel({
		subjects: auth.types,
		types: {
			folder: {
				related: { owners: ['staff'], parents: ['folder'] },
				permits: { view: ['owners', 'parents->view'] },
			},
		},
	}),
	store: createMemoryRelations(),
});

const root = { type: 'folder', id: 'root' } as const;
const reports = { type: 'folder', id: 'reports' } as const;
await files.grant(root, 'owners', grace);
await files.grant(reports, 'parents', root);
await files.can(grace, 'view', reports); // true: she owns its parent
```

A deep tree crosses one relation per level; past `maxDepth` (`25`) the check
is `PERMISSION_DEPTH`, never `false`.

### A relation read from the object

```ts
function fromField(field, subjectType): FromField;
function fromField(field, subjectType, { lookup }): ReversibleFromField;
type Lookup = (subjectId: string) => Promise<readonly string[]>;
```

`doctors: fromField('doctorId', 'staff')` reads the record's own `doctorId`
rather than a tuple kept in sync with it. Nothing is stored, and `grant`
refuses it at compile time. `can()` is given the object, and the compiler
requires every field a `fromField` of its type reads — here `doctorId` and
`patientId`:

```ts
await access.can(grace, 'view', { type: 'record', ...record }); // true: record.doctorId is grace's id
// @ts-expect-error — doctors is read from a field: there is nothing to grant
await access.grant({ type: 'record', id: record.id }, 'doctors', grace);
```

**Spread the loaded object.** A field missing at run time is a `TypeError`,
never a denial. `null` in the field holds nobody.

**`list()` needs a `lookup`.** It cannot read a field of objects it has not
found, so it asks `lookup` for the ids of the objects whose field names the
subject — in the clinic, `db.records.idsByDoctor(staffId)`. A `list()` that
would reach a `fromField` without one is a compile error, and your editor does
not offer that permission.

A lookup is your code, and it is not guarded: one that throws rejects `list()`
with its own error. **Never answer `[]` for a database that could not answer**
— that is a denial made of an outage.

### A condition

```ts
function when<const Rule extends string, Ctx>(rule: Rule, test: (ctx: Ctx) => boolean): When<Rule, Ctx>;
```

`edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)]` grants
the record's doctors, **while on shift**. The rule is any rule of the same
type — a relation, a permission, an arrow. The test is synchronous and pure:
it decides on what the caller passes, and reads nothing. Its `ctx` is what
`can()` and `list()` then **require** — and only for the permissions whose
rules reach it:

```ts
await access.can(grace, 'edit', { type: 'record', ...record }, { ctx: { onShift: true } });  // true
await access.can(grace, 'edit', { type: 'record', ...record }, { ctx: { onShift: false } }); // false
// @ts-expect-error — ctx is required: edit reaches a condition
await access.can(grace, 'edit', { type: 'record', ...record });

await access.can(grace, 'view', { type: 'record', ...record }); // no ctx: view reaches no condition
await access.list(grace, 'edit', 'record', { ctx: { onShift: true } });
```

### Permissions on a user

A user type may also be an object type: declare `staff` under `types`, and a
staff member is an object like a record — asked `can()`, granted relations,
listed. To decide who may edit a staff member, give `staff` the relations that
say so:

```ts
import { setOf } from '@nxgt/janus';

const people = permissions({
	model: defineModel({
		subjects: auth.types,
		types: {
			staff: {
				related: {
					self: fromField('id', 'staff', { lookup: async (staffId) => [staffId] }),
					managers: ['staff', 'staff#managers'],
				},
				permits: { edit: ['self', 'managers'] },
			},
			note: {
				related: { readers: ['staff', 'staff#managers'] },
				permits: { read: ['readers'] },
			},
		},
	}),
	store: relations,
});

const bob = await auth.staff.create({ username: 'bob' });
await people.can(bob, 'edit', bob);              // true: himself, read from his id
await people.can(ada, 'edit', bob);              // false
await people.grant(bob, 'managers', ada);
await people.can(ada, 'edit', bob);              // true: she manages him
await people.list(ada, 'edit', 'staff');         // herself, and bob
```

**A user passed as it is, is that user** — never a set, even when one of its
fields is named `relation`. A set on a user type is made by **`setOf`**: every
staff member who manages bob reads the note, and so does whoever manages them,
as the data stands:

```ts
await people.grant(note, 'readers', setOf(bob, 'managers'));
await people.can(ada, 'read', note); // true: she manages bob
await people.can(bob, 'read', note); // false: bob is not his own manager
```

`{ type: 'staff', id: bob.id, relation: 'managers' }` written out is a compile
error, and at run time still bob himself: only `setOf` marks a set. It copies
`type` and `id` only, so none of bob's fields reaches a tuple. On a user type
the model does not also declare under `types`, `setOf` is refused: there is no
relation to hold.

The `lookup` of `self` answers the one staff member whose id is the subject's,
so `list()` finds a user themself too.

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
permission comes before the object, and nothing yet says which type it is.

```ts
await access.can(grace, 'view', { type: 'record', ...record });                              // true
await access.can(grace, 'edit', { type: 'record', ...record }, { ctx: { onShift: false } }); // false
await access.can(null, 'view', { type: 'record', ...record });                               // false, no store call
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
them. Page with `limit` and `after`, passing each `nextCursor` back as it
came, until it is `null`:

```ts
const page = await access.list(grace, 'view', 'record', { limit: 50 });
page.items;      // readonly string[]: the records grace can view — hers, and her teams'
page.nextCursor; // string | null
await access.list(grace, 'view', 'record', { after: page.nextCursor, limit: 50 });

// Every page — annotate the page, or TypeScript cannot type the loop (TS7022):
let after: string | null = null;
do {
	const next: CursorPage<string> = await access.list(grace, 'view', 'record', { after, limit: 100 });
	for (const id of next.items) console.log(id);
	after = next.nextCursor;
} while (after);
```

`CursorPage` is exported from `@nxgt/janus`.

`limit` is 20 by default and at most 100 — a larger one is capped, and one
that is not a positive integer is a `TypeError`, so parse a limit read from a
request first ([troubleshooting](../troubleshooting.md#call-limit-must-be-an-integer-of-at-least-1-or-absent)).
`ctx` is required as for `can` — `list(grace, 'edit', 'record', { ctx })`.
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
and only a holder the relation admits — a staff member, or a team's members
where `'team#members'` is declared.

```ts
await access.grant(team, 'members', grace);                                               // a staff member
await access.grant(team, 'members', { type: 'team', id: 't2', relation: 'members' });     // a subject set
await access.grant({ type: 'record', id: 'r1' }, 'teams', team);                         // what 'teams->view' follows
await access.revoke(team, 'members', grace);
```

Both are idempotent: granting what is held, or revoking what is not, is not an
error. Each writes one tuple.

The same rule holds when reading: `can()` and `list()` follow only the holders
a relation admits. A tuple stored past `grant()` — by an older model, or by
hand — that the model does not admit grants nothing. `revoke()` refuses it as
it refuses to `grant()` it, so remove it with the store:

```ts
await relations.write({
	remove: [{ object: { type: 'record', id: 'r1' }, relation: 'teams', subject: { type: 'team', id: 't1' } }],
});
```

Narrowing a model therefore hides the tuples it no longer admits; it does not
delete them, and widening it again brings them back.

### Deleting

Wire the relation store into `janus({ relations })`, as the clinic does, and
deleting a user deletes every tuple naming them. Deleting an object's tuples
is yours, from your own code, when you delete the object:

```ts
await auth.staff.delete(grace);                              // grace, her sessions, and every tuple naming her
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

Load the record first: `can()` needs its `doctorId` and `patientId`. An
anonymous caller is `null`, which `can()` answers `false` without a store call
— a `401` here, a `403` for a signed-in one.

## Subjects and the notation

A user **is** a subject: `subjectOf(user)` from `@nxgt/janus` answers its
`{ type, id }`, and `can` takes the user as it is. Tuples print in Zanzibar's
notation, typed — `record:r1#teams@team:t1`, `team:t1#members@team:t2#members`
— see [the shared vocabulary](vocabulary.md#subjects-and-the-tuple-notation).

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
- [Troubleshooting](../troubleshooting.md#definemodel-) — every `defineModel` message
