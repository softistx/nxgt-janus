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

Read this file, then the README of the package you touch —
`packages/<name>/README.md`, starting with `packages/janus/README.md`.

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

**An adapter or integration reaches the library it wraps as a peer too, by
range.** Every package here that wraps one of nxgt-data's packages peers it —
`@nxgt/mongo` in `janus-mongo`, `@nxgt/redis` in `janus-redis` and
`janus-webhooks-redis`, `@nxgt/drizzle` in `janus-drizzle`, all three in
`janus-kit`, `@nxgt/mail` in `janus-mail` — and so does the driver beneath it
(`mongodb`, `drizzle-orm`). The
application already opened its connection with that library, and the package
must wrap *that* connection, not install a second copy beside it. A sibling
the kit wires internally is the one exception, by design: `@nxgt/janus-redis`
is a dependency of `janus-kit`, since the application never imports it —
while the libraries beneath it stay peers. For a
wrapped nxgt `0.x` library — nxgt-data's packages, and `@nxgt/telemetry` from
nxgt-telemetry — the range is `>=<floor> <1`: `>=0.17.0 <1`, `>=0.3.1 <1`,
`>=0.6.1 <1`, and `>=0.2.1 <1` for `@nxgt/telemetry` in the integration
`janus-telemetry`. A caret on a `0.x` version admits a single minor
(`^0.4.2` stops at `0.5.0`), and every minor upstream would then force a
release here. The same package sits in `devDependencies`, and `bun.lock` holds
the version the specs actually run on — every one of them npm's `latest` when
last checked, on 2026-09-27. For `@nxgt/telemetry` that is 0.2.1, the
floor itself: no later minor was published when the range was widened.
`@nxgt/redis` 0.3.1 and `@nxgt/drizzle` 0.6.1 are likewise their floors. For
`@nxgt/mongo` it is 0.18.1, above the 0.17.0 floor, and CI runs that version
from the lock. The floor, 0.17.0, is tested in CI, step *Run janus-mongo and
the kit's mongo specs on @nxgt/mongo 0.17.0* of the `floors` job: the
`janus-mongo` suite and the kit's mongo specs, each with its typecheck, on the
floor's tarball from npm, outside the lock (`scripts/run-on-peer-floor.ts`).
`@nxgt/mail`, from
nxgt-mail, peers `janus-mail` at `>=0.1.0 <2` — widened from `<1` when
nxgt-mail reached 1.0.0 (1.0 removed `withTelemetry`, `withRendererTelemetry`
and `RetryOptions`, none of which `janus-mail` imports) — and the specs run
on 1.0.1 from the lock, with `@nxgt/mail-config`, `@nxgt/mail-i18n`,
`@nxgt/mail-ui` and `@nxgt/mail-presets`, all 1.0.1, building `mails/` — whose
HTML follows dark mode since `@nxgt/mail-ui` 0.4.0, with a dark primary of its
own (`color-primary-dark`) since 0.5.0, a dark muted (`color-muted-dark`,
the sign-in code's box) since 0.6.0, and since 0.7.0 a dark muted text
(`color-muted-foreground-dark`) that the code and every muted text on a
flipping ground follow, so the two are set as a pair, and since 1.0.0 a dark
info (`color-info-dark`), the link under the button, set as a pair with a
darker light `color-info` since no one blue reads 4.5:1 on both cards (the
manifest is still format 1). `@nxgt/mail-presets` 1.0.0 added
`recovery-code-used`, whose count the build cannot pluralise: its sentence
is a message no template reads, `recovery-code-used.codes-left`, which
`janus-mail/scripts/codes-left.ts` parses at the build into
`src/generated/codes-left.ts`, and `src/codes-left.ts` formats at send
time — held equal to `@nxgt/mail-i18n`'s `createTranslator` by a spec, since
`createTranslator` is build-only here. The `mails/`
text parts have paragraph breaks since `@nxgt/mail-config` 0.2.0, and keep
each paragraph on one line since 0.2.1 (a spec in `render.spec.ts` holds it),
so `mail/maizzle.config.ts` sets no `plaintext` of its own. Since
`@nxgt/mail-presets` 0.3.0 the presets' message keys are kebab-case
(`presets.link-expires`, `verify-email.*`); `@nxgt/mail-i18n` 0.4.0 accepts a
camelCase or a kebab-case key, so an override under an old camelCase key is
a key of its own that no preset reads. Measured by hand on `@nxgt/mail-i18n`
0.5.0: in both `en` and `fr` it is ignored without an error; in `en` alone the
build refuses it as `missing — en, the fallback locale, has it`;
in `fr` alone as `not a key of en, the fallback locale`. Nothing here
names a key — `mail/locales/*.json` are `{}` — so the move built `mails/` byte
for byte as before. An override added to a catalogue must use the presets'
kebab-case key. The floor, 0.1.0, is tested in CI, step *Run janus-mail on
@nxgt/mail 0.1.0* of the `floors` job: the `janus-mail` suite and its
typecheck, rendering the `mails/` this build wrote, on the floor's tarball
from npm, outside the lock — so every lock bump meets the floor as well as
the latest. The `mails/` build reads the same under every `@nxgt/mail` in
the range, and **the build checks that it will**: a renderer reads every
manifest format up to its own, `@nxgt/mail` 0.1.0 reads format 1, and
`scripts/build-mail.ts` fails unless the manifest's `formatVersion` is
`@nxgt/mail-i18n`'s `MANIFEST_FORMAT` and at most `PEER_FLOOR_READS`, 1. A new
format from `@nxgt/mail-i18n` therefore fails the build here until the peer's
floor rises to an `@nxgt/mail` that reads it
(`packages/janus-mail/docs/guide/building.md`).

**A new `@nxgt/*` release is found by a schedule, not by memory.** A range
admits it the day it is published; the specs meet it only once the lock is
bumped. `bun run nxgt:outdated` (`scripts/check-nxgt-versions.ts`, spec'd in
`scripts/check-nxgt-versions.spec.ts`) lists every `@nxgt/*` devDependency
from outside this repository — the mail-* build packages included — whose
locked version is behind npm's `latest`: exit 0 when all are current, 1 when
something is behind, 2 when the registry did not answer, which is never read
as "current". The `nxgt versions` workflow runs it every Monday and on
`workflow_dispatch`; something behind opens the issue *@nxgt/\*
devDependencies behind npm latest*, or updates the one open, and fails the
run, and a later run with nothing behind closes it. The bump is then a pull
request like any other: the devDependency and `bun.lock` in one commit, the
suites that use it run, and the sentences above updated. It runs the full CI,
**Floors included**, since a new version upstream can break a floor as well
as the pinned servers. A peer floor moves only when the new version forces
it. A lock bump changes nothing published, so its changeset is an empty one
(`---` twice): `changeset status` still asks for one, since a `package.json`
changed.

Not Dependabot, though it has a `bun` ecosystem: its updater reads `bun.lock`
up to `lockfileVersion` 1 — `MAX_SUPPORTED_LOCKFILE_VERSION` in
dependabot-core's `bun/lib/dependabot/bun/bun_package_manager.rb`, with Bun
1.3.14 in its image, checked on 2026-09-27 — and this lock, written by Bun
1.4.2, is version 2. When Dependabot reads version 2, a `.github/dependabot.yml`
limited to `@nxgt/*` and grouped into one pull request can replace the
workflow; its pull requests would still need the `Changeset present` step to
pass.

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
  with a `code`. One exception, decided for `@nxgt/janus/permissions`: an id
  `grant()` or `revoke()` cannot store — notation characters, a NUL, a lone
  surrogate — is a `TypeError`. A grant writes the application's own ids, so a
  bad one is its bug; the reads a request reaches, `can()` and `list()`, answer
  such an id as an absence instead, and never throw on it.
- A message reports a **shape and never a value**, names the call the consumer
  wrote, and **never contains a URI** — a connection string holds a password.
- `process.emitWarning` is the only logging channel. A library does not own
  stdout.
- `*.spec.ts` colocated in `src/`; `test/` holds cross-subject helpers only;
  `test/types/` is typechecked and never run.

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

**The mail catalogues are not an exception either**: a message key in
`packages/janus-mail/mail/locales/*.json` is `@nxgt/mail-presets`' own name
(`presets.link-expires`, kebab-case since presets 0.3.0), and so is a
template's file name (`verify-email`). They are upstream's names, read by the
Maizzle build, never a field, an option or a wire format of this package —
and JSON, out of Biome's reach.

**SQL identifiers are `snake_case`, and that is the one exception** (decided
2026-09-25, `@nxgt/janus-drizzle`). A table or column name is PostgreSQL's
vocabulary, not Janus's: its catalog and `@nxgt/drizzle`'s `timestamps()` are
`snake_case`, and a camelCase column must be quoted in every query written by
hand — `"createdAt"` — or PostgreSQL folds it to `createdat`. The names live
only in the `pgTable` definitions' string arguments; the Drizzle keys, and
every record a store answers, are camelCase.

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
- **A name the user picks from a list goes in a constraint, not only in a
  check.** An editor completes from a type parameter's constraint; a check
  intersected into the parameter refuses the same mistakes and completes
  nothing, since the literal being typed meets it first. `defineModel` types
  `types` as `Ts extends ModelTypesOf<Subjects[number], Ts>`, and
  `src/permissions/completions.model.spec.ts` and
  `completions.questions.spec.ts` ask the language service what it offers —
  measured, like the refusals.
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

Eleven packages under `packages/`, all published: the core `@nxgt/janus`, and
the adapters and integrations that peer it. The core has several entry
points, below. A published entry point is a **public promise**, so a subpath appears in
`exports` only once it exports something a consumer should call.

| Entry point | State |
| --- | --- |
| `.` | **Identities**: `janus()`, the identity stores' port, their reference and the hashers — and the vocabulary shared with permissions: errors, subjects, pagination, time, ids |
| `./permissions` | **Permissions**: `defineModel`, `fromField`, `when`, `permissions()` — `can`, `list`, `grant`, `revoke` — the `RelationStore` port and `createMemoryRelations()` |
| `./conformance` | The suites an adapter runs — `describeJanusStores`, `describeRelationStores` — and their reference harnesses. Shipped as product surface, not as a test helper |

The permission *vocabulary* — subjects, the notation, `PermissionDepthError` —
lives at `.`, not `./permissions`, because both modules import it — and because
the equality between a user id and a subject id is the only reason users and
permissions are one package.

**Two sides, each usable alone.** Identities (`.`) and permissions
(`./permissions`) share the vocabulary and the store guard
(`src/stores/guard.ts`), and **neither loads the other's code**:
`src/entries.spec.ts` walks the runtime import graph of each entry point and
fails if `./permissions` reaches `src/auth/`, or `.` reaches
`src/permissions/`. A type-only import loads nothing and is allowed. Something
both sides need goes in a shared directory, never in one side imported by the
other — that is how `guardRelations` left `src/auth/outage.ts`.

**One word per idea.** The documentation, the error messages and the doc
comments use the words defined in `packages/janus/docs/guide/vocabulary.md`
(`## Words`): *side*, *identities*, *permissions*, *user*, *user type*,
*login*, *subject*, *tuple*, *identity stores*, *relation store*, *adapter*, *integration*.
A new idea gets a row there before it gets a second name.

**A package's README is its npm page**, and every package's carries the same
six sections — *Install*, *API*, *Traps*, *Documentation*, *Type safety,
counted*, *Licence* — beside whatever sections of its own it needs (*Usage*,
*Subpaths*, *What the database holds*). *API* is every export a consumer calls;
*Traps* is every mistake that compiles and fails later. Both are on the npm page
because that page is where a consumer outside this organisation looks first.
The detail lives in the package's `docs/` — `guide/`, `troubleshooting.md`,
`roadmap.md` — which *Documentation* links.

The repository skeleton (`build.ts`, `scripts/verify-artifacts.ts`,
`scripts/publish.ts`, the workflows, `bunfig.toml`, the tsconfigs) is **copied
from nxgt-data, never shared**. That is the fourth copy, beside nxgt-http and
nxgt-core, and nxgt-data's AGENTS.md, in its table of what is kept twice, says
to change both when the reason holds for both. `verify-artifacts.ts` is split
into `scripts/artifacts/` in all four copies, which hold the same checks apart
from nxgt-core's `browser.ts`; where they differ is in *Deliberate duplications*.

**Imports carry no extension**: `from './engine'`, not `'./engine.js'` — in
the sources, and in what the build emits, the `.d.ts` files included.
**`moduleResolution: bundler` is the contract**: every tsconfig here resolves as
a bundler does, Bun runs the specs the same way, and a consumer does too, which
the READMEs' Install sections say. `moduleResolution: nodenext` is out of
contract. "Fixing" it by rewriting the emitted declarations was merged once
(#16) and reverted (#17): it is the same rule, broken one step later, and a
second resolution mode to keep working is a promise nobody measures.

**Generated code goes in a `generated/` folder**, never behind a suffix such as
`.generated.ts` or `.gen.ts`. `@nxgt/janus-mail` is the first package that
generates code: `src/generated/mail.ts`, `src/generated/locales.ts` and
`src/generated/codes-left.ts`, written by its build, and `biome.json`'s `files.includes` has `!**/generated` beside
`!**/dist`. The output is **committed**, so a package type-checks without
running its generator; CI rebuilds it and diffs `packages/*/src/generated`
against the commit right after the build, so a stale committed copy fails
there. Since `@nxgt/mail-i18n` 0.2.0, the header it writes into
`generated/mail.ts` says *never committed: git-ignore it* — its advice to an
application. This repository commits the file anyway, as a declared
divergence: the rule here is the one above, and the header is not edited,
since the file is the generator's. The folder says
what is generated from the tree alone, one path excludes all of it from a
review or a lint, and the file keeps the name its content deserves, so the
import reads `./generated/mail` like any other module.

### Maizzle runs at our build, never at the consumer's

`@nxgt/janus-mail` ships e-mails built with Maizzle, and the consumer installs
no Maizzle, no Vue and no Tailwind: they are **devDependencies**, with the
build-only `@nxgt/mail-config`, `@nxgt/mail-i18n`, `@nxgt/mail-ui` and
`@nxgt/mail-presets` — and `@formatjs/icu-messageformat-parser`, pinned to
the version `@nxgt/mail-i18n` depends on, which parses the codes-left
plural. `@maizzle/framework` and `@maizzle/tailwindcss` are
pinned exact and **direct** — under Bun's isolated install, a Tailwind that is
only another package's dependency fails silently, and the build succeeds with
no styles. The Maizzle project is `packages/janus-mail/mail/`; the package's
`build` runs `scripts/build-mail.ts` (Maizzle, then checks that the manifest's format is one
`@nxgt/mail` 0.1.0 reads and that exactly the
nine e-mails were built, then writes the generated files) before `../../build.ts`. No `postinstall`: nothing
runs in a consumer's install. The run-time side is `@nxgt/mail`'s renderer,
a peer. The `maizzle` bin runs on the `node` on the `PATH`, even under
`bun run`, and Maizzle 6.1.7 needs Node `^22.22.3`, `^24.15.0` or `>=26`
(`postcss-merge-longhand` 9 calls `Set.prototype.difference`): under Node 20
the mail build fails, while sending stays on Node 20 or later.

**What a build writes outside `dist/` goes beside it, never in it.** The root
`build.ts` removes from `dist/` every file it did not write — that is how a
deleted module stops shipping — so the built e-mails live in
`packages/janus-mail/mails/`, listed in `files` and ignored by the package's
`.gitignore`. The module that resolves the folder (`src/mails.ts`,
`new URL('../mails/', import.meta.url)`) sits directly under `src/`, so the
same path is right from `src/` in the specs and from `dist/index.js` in the
tarball; a second entry point would bundle it into `dist/chunks/` and break
that, which the package's artifact spec would catch. `verify:artifacts`
checks that every `files` entry is in the packed tarball.

`bunfig.toml` carries the npm token, **never `.npmrc`** — an undefined variable
in an `.npmrc` sends an **empty** token, and the registry calls that a 401.

### A new package starts private, and the flag is how

Until v0.1 every package here carried **`"private": true`**, and a new package
still starts with it. The `Release` workflow fires on every push to `develop`
and publishes anything whose version is not on the registry — `0.0.0` is not —
so the very first push tried to publish `@nxgt/janus@0.0.0` and failed on the
token. The token was not the problem; the missing guard was.

`scripts/publish.ts` skips a private package. **`scripts/verify-artifacts.ts` does
not** — it globs `packages/*/package.json` regardless of the flag, so the
subpath-loading and one-class-per-entry checks keep running on every push, which
is the whole point of having them from commit 1.

Removing `"private"` is what makes a package publishable. It is a deliberate
commit of its own, with the changeset that versions it, and not something to do
while fixing something else. `@nxgt/janus` and `@nxgt/janus-mongo` lost it
together, for v0.1, when the repository went public; every package since has
lost it the same way, `@nxgt/janus-graphql` last.

**A private package never gets a changeset before that commit.** `changeset
version` would consume it and `publish.ts` skip the package, keeping the
release in version mode (#51 → #53). `bun run changeset:private`
(`scripts/check-changesets.ts`, run by CI) refuses a changeset naming a private
package or one that does not exist, and a changeset whose front matter
changesets cannot read. The check is janus-only for now: nxgt-data, nxgt-http
and nxgt-core hold no private package, so their copies of the skeleton owe
nothing.

---

## The highest packaging risk in the design

`StoreFailure` is thrown by `@nxgt/janus-mongo` and tested with `instanceof`
inside `@nxgt/janus`. **Two copies of that class and the whole product is wrong
about what an outage is.** Three guard rails, all mandatory from the first
commit:

1. `@nxgt/janus` is a **required peer** of every adapter and integration
   (`@nxgt/janus-hono`, `@nxgt/janus-graphql`), never a dependency, and neither **defines an error
   class** — they throw, and test `instanceof` against, the peer's.
2. The **one-class-per-entry-point scan** that `scripts/verify-artifacts.ts`
   runs (`scripts/artifacts/classes.ts`), plus
   its peer-range checks (a range that excludes the sibling's current version,
   an exact pin, a package that lists itself).
3. An **`instanceof` probe inside the conformance suite**: the outage case
   throws from the adapter and checks identity against the class imported from
   the core.

That third one is the lesson of the sweep that produced guard rail 2: **the
probe says what breaks, the scan says whether it is present, and both are
needed** — a runtime probe passes happily on inert duplication.

The same holds for the mark `setOf()` puts on a subject set, read by
`@nxgt/janus/permissions` on a value made by `@nxgt/janus`. It is a
`Symbol.for` property rather than a module-level `WeakSet` for that reason:
two copies of the module still agree on a registered symbol.

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
| The repository skeleton | root | Copied from nxgt-data. Fourth copy, by the rule above. `scripts/artifacts/` was split here first, and nxgt-data, nxgt-http and nxgt-core now follow it module for module. All four hold the test-code check, the guard that reports an unbuilt package as `no dist/`, and `missingFiles`, whose spec holds that a `files` entry `dis` is not covered by `dist/`. Only nxgt-core has `browser.ts`, for the `browser` export condition, which no package here declares. This copy and nxgt-data read a sibling's version from the workspace; nxgt-http and nxgt-core read it from the packed manifests. Outside `scripts/artifacts/`, `check-nxgt-versions.ts` is in nxgt-data and nxgt-core as well, ported from here (nxgt-data #139, nxgt-core #158); nxgt-http has none, since every `@nxgt/*` package it depends on is a workspace sibling. `check-changesets.ts`, `run-on-peer-floor.ts`, `run-in-floor-project.ts`, `scripts/peer-floor/` and `scripts/floor-project/` are this copy's alone. A check added to one copy is a check to port to the others |
| `test/server.ts`, the pinned Redis the specs start | `packages/janus-redis/test/`, `packages/janus-kit/test/`, `packages/janus-webhooks-redis/test/` | A test helper in one package cannot be imported by another's specs without a shared test package; three copies of 60 lines are cheaper. The Redis version in them keys the one `.cache/redis`, and `$JANUS_REDIS_VERSION` and `$REDIS_BIN` override it the same way in all three. Byte-identical, and both CI jobs, `ci` and `floors`, key their Redis cache on all three. Change one, change all |
| The Redis script runner and reply reader — `scriptsOver`, `isNoScript`, `runner` and its `Run`, `stamp`, `readerOf`, `unreadable` | `packages/janus-redis/src/{stores,replies}.ts`, `packages/janus-webhooks-redis/src/{queue,replies}.ts` | Two adapters of two ports in two packages, and neither may depend on the other; a shared package for 80 lines would be a third to publish. The runner is the same but for its failure's message: `webhookQueue.<method>: the queue could not answer` with `operation` only, where janus-redis says `<slot>.<operation>: the store could not answer` with `slot` too. `runner` takes no `slot` here, and this copy's `Run` takes a lazy `argsOf(operation)` builder where janus-redis's takes an eager `args` array, so a refusal names the operation before any I/O. The reader reads dates the same way — any number but `''` and `NaN` — and a count's digits the same way, with two differences: janus-redis's field `count` answers `0` for an absent field (a token of an earlier version) where this copy fails, and janus-redis's reply `count` takes any number where this copy's `toCount` requires a safe integer, 0 or more. `unreadable` differs in the same way as the runner. The webhook copy adds `type` and `failure`, and refuses before any I/O what it could not read back. Change one, change both |
| `test/case.ts`, a case as a Redis user of its own prefix, its faults by `ACL SETUSER` | `packages/janus-redis/test/`, adapted in `packages/janus-webhooks-redis/test/` | Same. The adapted copy opens one user per method, since that port's fault fails one method and not the store, and fails the insert half-way by key permissions. Both end with the same `redisPerFile()`, the file's server started and stopped around its cases. A change to how a case opens or fails belongs in both |
| `test/mongo.ts`, the pinned replica set the specs start | `packages/janus-mongo/test/server.ts`, `packages/janus-kit/test/mongo.ts` | Same; the mongod version in both keys the one `.cache/mongodb` |
| The DDL helper, drizzle-kit's `generateMigration` over `defineJanusTables()` | `packages/janus-drizzle/test/db.ts`, `packages/janus-kit/test/postgres.ts` | Same |
| The integrations' reading of `janus()` and of a refusal — `Auth`, `UserOfAuth`, and the fields a client may read from a `JanusError` (`issues`, `minLength`, `attemptsLeft`) | `packages/janus-hono/src/{session,errors}.ts` (`bodyOf`), `packages/janus-graphql/src/{types,errors}.ts` (`actionable`) | Each is a few lines typed against its framework — Hono's `Env`, GraphQL's `extensions` — and the rule behind the fields is `@nxgt/janus`'s: never `reason`, `login` or a cause. The status table is **not** duplicated: both answer `@nxgt/janus`'s `statusOf`, moved there so a third integration does not copy it. A field added to what a client may read belongs in both |
| The characters no object id may hold — `@`, `#`, parentheses — and the empty id; and what no store keeps — a NUL character, a lone surrogate | `packages/janus/src/permissions/input.ts` (`RESERVED`, `idOf`) and `packages/janus/src/stores/storable.ts` (`isStorable`), `packages/janus-graphql/src/directives/permission/enforce.ts` (`UNNAMEABLE`, `isNameable`) | `@nxgt/janus/permissions` exports no predicate for either, and a regular expression and a two-term test are not worth a public promise. `can()` refuses the first with a `TypeError` and holds the second for nobody; `@permission` reads ids a client sent, so it answers both `NOT_FOUND` before asking, and never hands them to the application's loader. Change one, change both, or an id the core refuses becomes a 500 |
| Freshness: `now - authenticatedAt >= maxAge` refuses with `StepUpRequiredError` | `packages/janus/src/auth/sessions/fresh.ts` (`assertFresh`), `packages/janus-hono/src/fresh.ts` (`fresh`) | One comparison, repeated so that the Hono middleware's refusal names `fresh()`, the call the consumer wrote, rather than `assertFresh`; a `where` parameter on `assertFresh` would be a public promise for one message. Both refuse **at** `maxAge`, and a spec in each pins that boundary. Change one, change both. `@nxgt/janus-graphql` calls `assertFresh` rather than copying it: a client reads only the fixed message of the status, so the call named in the logged cause does not matter, and `fresh.fields.spec.ts` pins the boundary there too |
| The conformance helpers — `equal`, `ok`, `rejects`, `isOurs`, `describeSuite`, `fromGlobals` | `packages/janus/src/conformance/{assert,describe}.ts`, `packages/janus-webhooks/src/conformance/{assert,describe}.ts` | `@nxgt/janus/conformance` exports its suites, not its helpers, and a second port's suite in another package needs them; exporting them would make them a public promise for 150 lines. Both `isOurs` take the error's `name` rather than reading `cls.name`, since `@nxgt/janus`'s bundle renames `StoreFailure` to `StoreFailure2`, and their bodies are identical. The copy has no `isNull`: a queue answers no `null`. Change one, change both |

---

## Tests

- `*.spec.ts` colocated in `src/`. `test/` holds cross-subject helpers only.
- **A spec split by behaviour becomes siblings**, `<subject>.<behaviour>.spec.ts`
  next to the module it tests (`engine.keto.spec.ts`,
  `list.pagination.spec.ts`), and each case keeps its describe path and name.
  What they share goes in one `<subject>.fixtures.ts` beside them, which holds
  no test, is imported by specs only and imports no other fixtures file; a
  helper several subjects use, such as `rejection` or janus-webhooks'
  `test/deliveries.ts`, goes in `test/` instead. Every `tsconfig.build.json`
  excludes `**/*.fixtures.ts` as it excludes the specs, so none ships;
  `verify:artifacts` does not count one as a build input, and fails on a
  tarball that ships one. A fixture that
  *ships* is named `fixtures.ts` in its folder, with no dotted prefix, as
  `src/conformance/` does. A split spec's server stays one per file:
  `redisPerFile()` in the Redis adapters' `test/case.ts`, and `mongoPerFile()`
  in `packages/janus-kit/src/mongo/connect.fixtures.ts`, register its
  `beforeAll`/`afterAll` in each spec file that calls them.
- `test/types/` is typechecked by `tsc --noEmit` and **never run**. A list
  split by behaviour becomes a folder, `test/types/<area>/`, one file per
  behaviour and a `fixtures.ts` for what they share
  (`test/types/permissions/`); the numbering of its cases runs across the
  folder.
- In `packages/janus`, a fixtures file under `src/auth/`, `src/permissions/`
  or `src/stores/` is read by the scan in `src/auth/outage.scan.spec.ts`: no
  `catch` and no two-argument `.then` in it.
- MongoDB, in `@nxgt/janus-mongo` and `@nxgt/janus-kit/mongo`:
  `mongodb-memory-server-core` as a single-node replica set, binary cached in
  `.cache/mongodb`, one server per spec file, a clean database per case —
  dropped between cases, or a new one. Measured in nxgt-data: starting a
  mongod costs ~300 ms warm, dropping a database costs milliseconds.
- Redis, in `@nxgt/janus-redis`, `@nxgt/janus-webhooks-redis` and
  `@nxgt/janus-kit/drizzle`: a real `redis-server` per spec file, started by
  `test/server.ts` through `redis-memory-server`, which compiles the pinned
  version (7.4.1) from source into `.cache/redis/<version>` the first time.
  `$JANUS_REDIS_VERSION` compiles another version instead; `$REDIS_BIN` names a
  binary to run and skips the build — a Valkey's `valkey-server` works.
- PostgreSQL: `@nxgt/janus-drizzle` runs every case on the server
  `$JANUS_POSTGRES_URL` names, or on PGlite without one. `@nxgt/janus-kit`
  runs its drizzle cases on PGlite, and only `connectKit() over a PostgreSQL
  URL` on that server.
- **The floors the READMEs promise are measured, not claimed.** CI's `ci` job
  runs everything on PostgreSQL 17 and Redis 7.4.1; its `floors` job, in
  parallel, runs only the suites a floor concerns on the oldest version each
  README allows — `@nxgt/janus-drizzle` and the kit's PostgreSQL-URL case
  on PostgreSQL 15, the two Redis adapters and the kit's drizzle specs, whose
  Redis is real, on Redis 7.0 (7.0.15), the two Redis adapters on Valkey 7.2
  (Valkey's first line, a built binary from download.valkey.io). The library
  peers' floors run there too, through `scripts/run-on-peer-floor.ts`, which
  points the named packages' link to a peer at the floor's tarball, runs a
  command, and puts the links back — never touching `package.json` or
  `bun.lock`. The peer is any lowercase npm name, scoped (`@nxgt/mongo`) or
  not (`graphql`) — an old name with capitals, such as `JSONStream`, is
  refused; so is a malformed one, or a version other than an exact one, before
  anything is fetched. It runs `@nxgt/mail` 0.1.0 under
  `janus-mail`, and `@nxgt/mongo` 0.17.0 under `janus-mongo` and the kit's
  mongo specs. The other `@nxgt/*` peers are locked at their floors, so the
  `ci` job already runs them; a lock bump that lifts one above its floor adds
  a step here. Locally, the command the step runs, for instance
  `bun scripts/run-on-peer-floor.ts @nxgt/mail@0.1.0 janus-mail --
  bash -c 'cd packages/janus-mail && bun test src scripts && bun run typecheck'`;
  a link it refuses as left by an interrupted run is fixed by `bun install`.
  A floor the rest of the workspace also resolves cannot be linked over:
  graphql-yoga and the `@graphql-tools/*` packages resolve graphql 17 from
  Bun's store, so one package's link at 16.9.0 gives its specs two copies of
  graphql. `scripts/run-in-floor-project.ts` runs those instead: it packs the
  package and its `workspace:` siblings, installs them in a scratch project
  (hoisted) with the floors, `--single` ones overridden for every package,
  and everything else the package lists at the version the workspace
  resolves, refuses the install unless it holds exactly one copy of each
  `--single` floor and both the copied sources and the packed package resolve
  every floor, imports the packed package, and runs the command in a copy of
  the package's directory — all but its `node_modules` and `dist/`, with
  the root's `tsconfig.base.json` beside it — then removes the project. It
  runs `@nxgt/janus-graphql` on `graphql` 16.9.0, `@envelop/core` 5.0.0 and
  `@graphql-tools/utils` 10.0.0, one copy of graphql; graphql-yoga keeps
  its own newer `@envelop/core` and `@graphql-tools/utils`, nested. A floor
  outside the package's peer range, or not a peer of it, is refused before
  anything is made. Locally, after `bun run build`, with the scratch space
  under `TMPDIR`: `bun scripts/run-in-floor-project.ts janus-graphql
  graphql@16.9.0 @envelop/core@5.0.0 @graphql-tools/utils@10.0.0 --single
  graphql -- bash -c 'bun test src && bun run typecheck'`.
  A README that states a new floor adds it to that job; a
  floor that fails there means the README is wrong, and the owner decides what
  it promises instead; it is never made green by testing a newer version.
  Locally: `JANUS_REDIS_VERSION=7.0.15 bun test src` where 7.0.15 compiles —
  its bundled jemalloc fails with GCC 16, and then `REDIS_BIN` names a 7.0
  `redis-server` instead, such as the one in the `redis:7.0.15` image
  (`docker cp <container>:/usr/local/bin/redis-server …`);
  `REDIS_BIN=<valkey-server>` for Valkey.
- **Settle an expected rejection where it is created**, with `.then(ok, ko)`. A
  rejection awaited too late is counted unhandled by Bun and fails the test with
  the very error it was checking — *a loaded CI runner fails where an idle
  laptop passes*.

## Verifying

```sh
REDISMS_DISABLE_POSTINSTALL=1 bun install   # see below
bun run check        # biome, and the naming convention that holds the casing rule
bun run build        # before typecheck: siblings resolve through their dist/
bun run typecheck    # includes test/types/, which is the type-safety measurement
bun run test
bun run verify:artifacts   # on the tarball actually packed
bun run changeset:private  # no changeset names a private or unknown package
```

**`build` comes before `typecheck`.** Every package's `exports` points at
`./dist/*`, so a package that imports a sibling — every adapter imports
`@nxgt/janus` — reads the sibling's *emitted declarations*. In a fresh checkout
there are none: measured on 2026-09-27, `bun run typecheck` with no `dist/`
fails in eight packages of nine, 322 errors starting with `TS2307: Cannot find
module '@nxgt/janus'`. A working tree with a stale `dist/` hides this, and
`ci.yml` builds first for the same reason. Pointing `paths` at the sibling's
sources would make it pass unbuilt, and would stop measuring what a consumer
compiles against — the declarations — so the order stays instead.

**`bun.lock` is committed, and CI installs with `bun i --frozen-lockfile`**,
which fails rather than rewrite a lockfile that disagrees with the manifests.
So a change to a `package.json` lands with the `bun.lock` that `bun install`
wrote for it, in the same commit. Bun is pinned — `packageManager: bun@1.4.2`,
and the same version in `.github/actions/setup` — because the lockfile's format
is Bun's. `changeset:version` runs `bun install --lockfile-only` after the bump
for a reason of its own: `workspace:^` is published as the version read from
`bun.lock`, and a stale one publishes a range that leaves out the sibling
released beside it, which `verify:artifacts` refuses.

**`REDISMS_DISABLE_POSTINSTALL=1` skips a Redis nothing uses.**
`redis-memory-server` is on Bun's default trusted list, so its postinstall runs
and compiles the latest Redis from source into `node_modules/.cache` — minutes
of CPU, measured at 227 s against 31 s for a cold install. The specs never run
that binary: `test/server.ts` builds the pinned one into `.cache/redis` on
first use. The setup action sets the variable; a plain `bun install` still
works, only slower.

`verify:artifacts` is the one that matters most here: it loads **every**
declared subpath and proves `JanusError` is defined once. That is the check that
catches `splitting: false`, and it runs from the first commit. Its stages, in
order, stopping at the first that fails: a missing `dist/`, or one older than
its `src/`; then
the packed tarballs, whose problems are reported together — a license other
than MIT or no `LICENSE`, a `files` entry the tarball does not hold, **test
code** (a `*.spec.*`, a `*.test.*`, a snapshot or a `<subject>.fixtures.*`,
named as `<package>: the tarball ships test code: dist/x.fixtures.d.ts`), a
`link:` or `file:` a consumer installs, a package that lists itself, a sibling
pinned exactly or a range that leaves it out, and a required peer on no
registry; then an install that fails, a subpath that does not load, a class
defined twice, and a bin that does not run. A `fixtures.*` with no dotted
prefix, as in `conformance/`, ships on purpose and passes.

`scripts/verify-artifacts.ts` only runs those stages; each lives in
`scripts/artifacts/`, one module per responsibility, with a spec beside each
pure one (`packages.ts` reads the workspace, `tarball.ts` a tarball's entries,
`manifest.ts` its dependency fields, `registry.ts` asks npm, then `stale.ts`,
`classes.ts`, `install.ts`, `load.ts`). The split was made here to keep every
file under 250 lines, and the three other copies have since followed it; the
skeleton's row in *Deliberate duplications* says where they still differ.

The scripts have specs of their own, run by the root `test` through
`bun test ./scripts/`. The leading `./` matters: a bare
`bun test scripts` is a substring filter, and on 2026-09-28 it ran 166 tests
across 23 files, `janus-mail`'s two `scripts/*.spec.ts` included a second time.
`scripts/artifacts/*.spec.ts` covers the pure checks. Among them is the
one-class-per-entry scan, proven against a real `Bun.build` both with and
without `splitting`. `scripts/publish.spec.ts` covers the publish order and the
skipping of a `private` package. The first run of those two found that
`newestMtime` threw `ENOENT` on a missing `dist/`, where it should have
reported the package as unbuilt. `scripts/check-changesets.spec.ts` covers the
changeset check — read with `@changesets/parse`, the parser `changeset version`
uses, so a shape it accepts is never let through unread.
`scripts/check-nxgt-versions.spec.ts` covers which devDependencies are
tracked, what counts as behind, a registry that fails or answers no version,
and the reading of this repository's own
`bun.lock`. `scripts/peer-floor/*.spec.ts` cover the floor script's argument
parsing, the tarball's integrity check and the floor's own ranges against the
peers staged beside it, and `*.unscoped.spec.ts` beside them an unscoped name:
the names parsing accepts and the malformed ones it refuses, the registry
document and tarball the download asks for, and a tarball it refuses for its
integrity. `scripts/run-on-peer-floor.spec.ts` runs it on a scratch store laid
out as Bun's isolated install (`run-on-peer-floor.fixtures.ts`), and holds
that the links and the temporary directory are put back after a success, a
failed stage, a failed download and a SIGTERM, and that a stale link is
refused; `run-on-peer-floor.unscoped.spec.ts` runs the same store with an
unscoped peer, whose locked copy sits beside its siblings rather than under a
scope and is not linked over the floor, and holds that a success and a failed
stage put everything back and that a missing unscoped link is refused.
`scripts/floor-project/*.spec.ts` cover the scratch project's argument
parsing (`--single` on a name that is no floor, a floor named twice, a
package that is not one directory), its manifest — what is packed, what is
carried at the workspace's version, a floor outside the peer range or not a
peer — the copies a hoisted tree holds and what a directory resolves, and
the copy of the package and the versions carried from the workspace, a name
that does not resolve refused with *run bun install*;
`scripts/run-in-floor-project.spec.ts` runs it on a scratch workspace
(`run-in-floor-project.fixtures.ts`) with the pack and the install stubbed,
and holds that the command runs in the copy on the floor and the project is
removed after a success, a second copy of a `--single` floor, a packed
package resolving another version, a packed package that does not load and
a SIGTERM. Both floor scripts forward SIGINT and SIGTERM through
`scripts/peer-floor/forward.ts`, whose spec holds that a signal arriving
before the command answers `128 + <signal>` without running it.

---

## Commits and merges

**A commit's subject is `<type>(<package>): <Summary>`**, as the history
practises it:

- **`<type>`** is one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`,
  `ci`, `build` — and `revert`, used once, for #17. A `!` after the scope
  marks a breaking change: `feat(janus-drizzle)!: Unprefixed tables, …`.
  `build` is build configuration: tsconfig, bundler, packaging.
- **`<package>`** is the package's directory name, without `@nxgt/`:
  `fix(janus-webhooks): …`, or `docs(janus, janus-telemetry): …` for two. The
  scope names the package whose changelog the change belongs to. The early
  `feat(permissions)` commits named a module, not a package; that is not
  repeated.
- **No scope** for a change to the repository rather than to one package:
  `ci:` for the workflows and the setup action, `chore:` for the skeleton, the
  changeset scripts and a package made publishable, `docs:` for this file and
  for documentation across packages.
- **`<Summary>`** is a capitalised sentence, with no final period, saying what
  the change does: `fix(janus): Name the subject's type, not its id, in
  list()'s missing-lookup error`. A summary that opens on an identifier keeps
  the identifier's case: `fix(janus-hono): bindJanus binds what permission()
  takes`.
- The body says why, and what was measured.

**A pull request is merged with a merge commit** (`Merge pull request #N from
…`), never squashed or rebased, and a branch behind `develop` is brought up to
date by merging `develop` into it. Each commit then reaches `develop` with its
own subject, so its own scope, and the merge commit records which pull request
carried it.
