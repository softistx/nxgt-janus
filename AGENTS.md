# AGENTS.md

`nxgt-janus` is an **embeddable, typed alternative to the Ory suite**: a library
the application runs in its own process, whose persistence is a port the
developer may implement, with official adapters for the databases this
organisation already runs. Two modules — users first (`janus()`: sign-up,
sign-in, sessions, e-mail verification, password reset, several kinds of user
in one instance), permissions second: embedded relationship-based access
control on Zanzibar's data model without its infrastructure, plus relations
read from the application's own data and conditions written in TypeScript.

The surface is **flow-shaped and deliberately not Kratos's**: `user.email`, not
`identity.traits.email`; `auth.signIn(...)`, not a credential identifier
derived from a schema annotation. Kratos is what this replaces, not the model
to follow.

It is a **product for people outside this organisation**. The parc will be its
first user, not its audience. Two things follow from that and they are the
reason most of this file exists: a published entry point is a promise, and
**type safety is the selling point**, which means it has to be measured rather
than claimed.

Read this file, then the package's own `packages/janus/README.md`.

---

## Why this repository has a port and nxgt-data does not

`nxgt-data/AGENTS.md` forbids what this repository *is*:

> Every package is standalone: it depends on no sibling, only on the library it
> wraps, as a peer. […] Another database library is another package. […] Never
> factor across packages.

Under those rules there is no persistence port to reuse — and there must not be
one. The divergence is deliberate, and here is the argument:

> nxgt-data wraps libraries. Each package's input is a driver the application
> already chose, so a port there would be an abstraction over something the
> consumer can already see. Janus's input is a **behaviour** — storage — and its
> consumers are outside this organisation. **The port is the product.**

What nxgt-data forbids and this repository keeps forbidding: **factoring across
packages**. `@nxgt/janus-mongo` depends on `@nxgt/janus` as a **required
peer**, exactly as `@nxgt/mongo-kit` depends on `@nxgt/mongo`, and **defines no
class of its own** — it throws the peer's, so `instanceof` holds across the two.

### The other three declared divergences

Declared here so the review agent does not flag them on every pass.

| Divergence | Reason |
| --- | --- |
| `null`, not `undefined`, for an absence | `@nxgt/mongo`'s `findById` answers `undefined`. Here it is `null`, because `undefined` is what a missing property **and** a function with no `return` both produce: a store that forgets to answer would report "not found" by accident. `null` has to be written on purpose |
| Standard Schema, not Zod as a peer | The audience is outside. Accepting Zod *or* Valibot *or* ArkType beats imposing one. Precedent in the parc: `@nxgt/httpyz` already validates its responses this way |
| A redefined `CursorPage` | We cannot depend on a package from another repository for four fields. Deliberate duplication, recorded in the table below |

### What *is* taken from nxgt-data, without discussion

- The shape: **public generic form in `types.ts`, a degenericised mirror
  internally, one cast at the boundary** (`drizzle-meilisearch/src/types.ts`,
  `src/context.ts:13`).
- The verb rules: `define*` describes and touches nothing; `get*`/`bind*`
  attach; `connect*` opens; **`create*` assembles with no I/O and is
  synchronous**.
- The error rules: a refusal at **wiring** time is a bare `TypeError`; a refusal
  at **call** time, on a value that could have come from a request, is a class
  with a `code`.
- A message reports a **shape and never a value**, names the call the consumer
  wrote, and **never contains a URI** — a connection string holds a password.
- `process.emitWarning` is the only logging channel. A library does not own
  stdout.
- `*.spec.ts` colocated in `src/`; `test/` holds helpers only; `test/types/` is
  typechecked and never run.

---

## The inherited invariant, and it is the backbone

`nxgt-ory/packages/ory-sdk/src/errors.ts:14-17`:

> *A caller that maps it to `null` or `false` has turned an outage into a silent
> lockout.*

In an HTTP SDK that invariant lives in one unwrapping function. **In an embedded
core there is no status code, so it moves into the contract of the port** and is
checked mechanically by the conformance suite. That move is the whole reason
`./conformance` is a published entry point rather than a documentation page.

It cost nine routes answering 500 instead of 503 in kratos-ui, then six more in
self-learning, two days apart. It is not theoretical.

Stated as a rule an implementer can follow:

> **An absence is `null`. A failure throws.** Any method that can legitimately
> find nothing answers `null` (or `false`, or an empty page). Everything else —
> a refused connection, a timeout, a primary stepping down, a bug in the adapter
> — **throws**. Never write `try { … } catch { return null }` in an
> implementation of this port.

---

## No `snake_case`, anywhere

Ory is full of it — `expires_at`, `use_flow_id`, `subject_set`,
`redirect_browser_to`, `authenticator_assurance_level` — because its APIs are
read by clients generated in a dozen languages. Janus is a TypeScript library:
**everything is `camelCase`**, in record fields, in options, in errors, and in
any wire format that comes later.

Held by **Biome's `useNamingConvention`** — not by review, which does not hold
this kind of rule over time. `biome.json` names type properties, type methods,
class properties and class methods explicitly; enabling the rule at all also
brings its default `camelCase` convention for **object literal properties**,
which is how `{ subject_set: … }` is caught in a file that declares no type at
all. That is wider than what is written down, and wanted.

One exemption, in `overrides`: **`**/test/types/**`**. That directory's job is to
hold shapes that must be refused, so a `subject_set` key there is the point of
the line rather than a mistake. It cannot be suppressed locally instead — Biome
requires its suppression comment to be the last comment before the line, and so
does TypeScript's `@ts-expect-error`, and the two cannot both be last.

Two places where the temptation will be strong:

- **Permission tuples.** Zanzibar's words stay — `object`, `relation`,
  `subject` — because each is a single word and they are the terms of the
  domain. Subjects are **typed** (`{ type, id }`, and `{ type, id, relation }`
  for a subject set; decided 2026-09-24), so Keto's `namespace` became `type`,
  the word a user already carries, and `subject_set` has no equivalent to
  misspell. The notation (`record:r1#viewer@team:t1#member`) is Zanzibar's, and
  is not `snake_case`.
- **Emitting a Kratos document** would have required `ory.sh/kratos`'s
  `snake_case` vocabulary. It is not in v1, and if it ever returns it lives in a
  separate package whose job is to speak somebody else's language.

**The error codes are `SCREAMING_SNAKE` and that is not an exception**: they are
data values, not API identifiers — the same shape `code` has in `@nxgt/mongo`
and `@nxgt/redis`. Every *key* is `camelCase`.

---

## Type safety is measured, not claimed

`nxgt-data/AGENTS.md` carries the only honest way to make this an argument:

> A public method that refuses something must have a `@ts-expect-error` case in
> `test/types/`. Type safety is what the compiler rejects, not what the README
> claims: when this was last measured on `@nxgt/mongo`, **seven of twelve
> plausible mistakes still compiled**.

So, from the first commit: **write the list of plausible mistakes, one
`@ts-expect-error` per mistake, and put the count in the README.** A count that
goes down is a visible regression, and a `@ts-expect-error` that stops being
used fails the typecheck instead of passing unnoticed.

`packages/janus/test/types/refusals.ts` is that list. It also holds the shapes
that **must keep compiling**: a refusal that also refuses the correct call is
not type safety, it is a bug.

What this commits us to in the code:

- Each user type's schema travels through everything: `auth.staff.signIn`
  takes a `username`, and `authenticate` answers a union narrowed by
  `user.type`.
- Refusals land **on the offending key**, by template-literal types intersected
  into the parameter (`config: C & Checked<C>`), because `janus` infers its
  argument and excess-property checks therefore do not fire. Measured pattern:
  `nxgt-data/packages/mongo-kit/src/config/types.ts:46`.
- A login must name a **top-level, required string field** of the schema,
  refused at compile time: `password: { login: 'emial' }` is a type error on
  `login`. So is a schema declaring a field `janus` sets, and a user type named
  like a method.
- A flow a type cannot run is **absent from its type**: a user type with no
  e-mail has no `resetPassword`, rather than one that throws.
- A partially implemented store is a compile error naming the missing method,
  with the runtime check as a net for JavaScript callers.
- Error codes are a union of literals, so a `switch` over them is exhaustive and
  adding a code breaks the compilation of callers that exhaust it.
- **No `any` in the public surface** — `noExplicitAny` is *not* disabled in
  `biome.json`, unlike nxgt-data — and `noUncheckedIndexedAccess` is on.
- **`exactOptionalPropertyTypes` is on** in `packages/janus`. Without it,
  `{ active: undefined }` is a valid `UserPatch`, and a naive adapter writes
  it as an erasure — the Kratos `PUT` trap, arriving through the type system.
  The reference store still treats a key present as `undefined` as absent, for
  JavaScript callers.

---

## Layout

One package, several entry points. A published entry point is a **public
promise**, so a subpath appears in `exports` only once it exports something a
consumer should call.

| Entry point | State |
| --- | --- |
| `.` | `janus()`, its store port, the reference store and the hashers — and the vocabulary shared with permissions: errors, subjects, pagination, time, ids |
| `./conformance` | The suite an adapter runs, and `referenceHarness()`. Shipped as product surface, not as a test helper |

`./permissions` is **not** published, and will not be until a real traversal is
written against the tuple port. The permission *vocabulary* lives at `.` today
because both modules import it — and because the equality between a user id and
a subject id is the only reason users and permissions are one package.

The repository skeleton (`build.ts`, `scripts/verify-artifacts.ts`,
`scripts/publish.ts`, the workflows, `bunfig.toml`, the tsconfigs) is **copied
from nxgt-data, never shared**. That is the fourth copy, beside nxgt-http and
nxgt-core, and `nxgt-data/AGENTS.md:460` says to change both when the reason
holds for both.

`bunfig.toml` carries the npm token, **never `.npmrc`** — an undefined variable
in an `.npmrc` sends an **empty** token, and the registry calls that a 401.

### Nothing publishes until v0.1, and the flag is how

Every package here carries **`"private": true`**. The `Release` workflow fires on
every push to `develop` and `changeset publish` will publish anything whose
version is not on the registry — `0.0.0` is not — so the very first push tried to
publish `@nxgt/janus@0.0.0` and failed on the token. The token was not the
problem; the missing guard was.

`scripts/publish.ts` skips a private package. **`scripts/verify-artifacts.ts` does
not** — it globs `packages/*/package.json` regardless of the flag, so the
subpath-loading and one-class-per-entry checks keep running on every push, which
is the whole point of having them from commit 1.

Removing `"private"` is what makes a package publishable. It is a deliberate
commit of its own, taken together with going public, and not something to do while
fixing something else.

---

## The highest packaging risk in the design

`StoreFailure` is thrown by `@nxgt/janus-mongo` and tested with `instanceof`
inside `@nxgt/janus`. **Two copies of that class and the whole product is wrong
about what an outage is.** Three guard rails, all mandatory from the first
commit:

1. `@nxgt/janus` is a **required peer** of every adapter, never a dependency,
   and the adapter **defines no error class** — it throws the peer's.
2. The **one-class-per-entry-point scan** in `scripts/verify-artifacts.ts`, plus
   its peer-range checks (a range that excludes the sibling's current version,
   an exact pin, a package that lists itself).
3. An **`instanceof` probe inside the conformance suite**: the outage case
   throws from the adapter and checks identity against the class imported from
   the core.

That third one is the lesson of the sweep that produced guard rail 2: **the
probe says what breaks, the scan says whether it is present, and both are
needed** — a runtime probe passes happily on inert duplication.

`build.ts` shares the module across entry points with `splitting: true`.
Without that flag `Bun.build` inlines a shared module into every entry bundle,
which is the same hazard arriving from the build rather than from the
dependency graph.

---

## Deliberate duplications

The table that exists so a duplication is a decision rather than an accident.

| What | Where | Why not shared |
| --- | --- | --- |
| `CursorPage`, `pageLimit` | `src/pagination/` | Four fields are not worth a dependency on a package from another repository |
| `Clock`, `fixedClock` | `src/time/` | Same, and `fixedClock` is **shipped**, not test-only: a consumer testing session expiry needs it |
| The repository skeleton | root | Copied from nxgt-data. Fourth copy, by the rule above |

---

## Tests

- `*.spec.ts` colocated in `src/`. `test/` holds helpers only.
- `test/types/` is typechecked by `tsc --noEmit` and **never run**.
- MongoDB, when `@nxgt/janus-mongo` arrives: `mongodb-memory-server-core` as a
  single-node replica set, binary cached in `.cache/mongodb`, one server per spec
  file, the database dropped between cases. Measured in nxgt-data: starting a
  mongod costs ~300 ms warm, dropping a database costs milliseconds.
- **Settle an expected rejection where it is created**, with `.then(ok, ko)`. A
  rejection awaited too late is counted unhandled by Bun and fails the test with
  the very error it was checking — *a loaded CI runner fails where an idle
  laptop passes*.

## Verifying

```sh
bun install
bun run check        # biome, and the naming convention that holds the casing rule
bun run typecheck    # includes test/types/, which is the type-safety measurement
bun run build
bun run test
bun run verify:artifacts   # on the tarball actually packed
```

`verify:artifacts` is the one that matters most here: it loads **every**
declared subpath and proves `JanusError` is defined once. That is the check that
catches `splitting: false`, and it runs from the first commit.

**Owed:** `scripts/verify-artifacts.ts` was copied from nxgt-data **without its
own specs**, so the root `test` script runs the packages only. Write them and add
`bun test scripts` back — the checks that guard the build have no test of their
own until then, which is the worst place for that to be true.
