# @nxgt/janus

## 0.2.1

### Patch Changes

- [#52](https://github.com/softistx/nxgt-janus/pull/52) [`79bb857`](https://github.com/softistx/nxgt-janus/commit/79bb857a75397ea621b6e33933d4f3c6a54d322b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A NUL character or a lone surrogate in a user's fields is refused with `USER_INVALID` on every adapter, instead of reaching PostgreSQL and answering `STORE_FAILED` — a 503 for a database that is up. So is a login your own `password.normalize` function turns into one. A login holding one is nobody's: `signIn` answers `CREDENTIALS_INVALID`, `findByLogin` and `resetPassword.request` answer `null`, and no store is asked. `signOutEverywhere` reads an `except` that is no session id as none. A schema issue's path stops before a key holding one, so it never reaches a message. The conformance suite gains `users.edgeCharacters`: every other character, control characters and surrogate pairs included, must round-trip.
  
  A user MongoDB or the memory store already holds with such a character now gets `USER_INVALID` on any `update`, since the merged fields are validated whole: clean the field first.

- [#50](https://github.com/softistx/nxgt-janus/pull/50) [`69244f8`](https://github.com/softistx/nxgt-janus/commit/69244f8e7712f474876b3bbcd091481d14daaae5) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap names what comes next: one-time codes (by e-mail, and TOTP as a second factor), sending the e-mails with `@nxgt/janus-mail` and typed, translated default templates you can extend with a language or replace one by one, and signed webhooks. The vocabulary gains a **one-time code** row.

## 0.2.0

### Minor Changes

- [#49](https://github.com/softistx/nxgt-janus/pull/49) [`579ff03`](https://github.com/softistx/nxgt-janus/commit/579ff03d84809d7f1e1bf8f4c32ce5fe76b0aa9a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Breaking: an object type's keys are `related` and `permits`**, Keto's OPL words — `relations` and `permissions` are renamed, nothing else changes. Rules stay strings, typed and completed by your editor as before.
  
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
  
  An unknown key now reads `types.<type>.<key> is not a key of an object type: related or permits`. Run-time messages name the new keys: `types.<type>.related.<relation>`, `types.<type>.permits.<permission>`. An arrow through a relation that can hold a subject set (`teams: ['team', 'team#members']`, then `'teams->view'`) was refused by `defineModel` when it ran; it is now a compile error too.

### Patch Changes

- [#41](https://github.com/softistx/nxgt-janus/pull/41) [`db8bcaf`](https://github.com/softistx/nxgt-janus/commit/db8bcafb4284fda9a6609207658e17f80c16a5aa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/janus/conformance`: `sessions.deleteUser` asks the store first whether it still holds the session that lapsed, and expects `deleteUserSessions` to count it only then — 3, or 2 when the store already expired it. A store with its own expiry, a Redis key TTL, drops a lapsed session as soon as it lapses, which the port already allowed. A store that holds it and miscounts still fails.

- [#45](https://github.com/softistx/nxgt-janus/pull/45) [`67106ed`](https://github.com/softistx/nxgt-janus/commit/67106ed205eaa8725e18b08f928288ff03d867a0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `LOGIN_TAKEN`: the message no longer quotes the login — `insertUser: the login is taken by another patient` — as a message never carries a value, and an e-mail in a log line is personal data. `error.login` and `error.userType` still name it.
  
  **For adapter authors:** `@nxgt/janus/conformance` now checks that a login conflict's message does not quote the login. An adapter that copied the old wording fails `users` until its message drops the value.

- [#44](https://github.com/softistx/nxgt-janus/pull/44) [`506075f`](https://github.com/softistx/nxgt-janus/commit/506075ff9eb11f7bb49bcde5cfd5dfe2ddf11e5d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the vocabulary names a **kit** — a package that opens the connections and wires adapters and integrations into one object, as `@nxgt/janus-kit` does.

## 0.1.3

### Patch Changes

- [#32](https://github.com/softistx/nxgt-janus/pull/32) [`fe5bbfd`](https://github.com/softistx/nxgt-janus/commit/fe5bbfd26bad216941d8743541f579ea485d81b1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `list()` offers its permission to your editor: it completed nothing, because its reversibility check was intersected with the whole union of names. It now offers the names `list()` can answer — those reaching no `fromField` without a `lookup` — and refuses the others with the same message.

- [#30](https://github.com/softistx/nxgt-janus/pull/30) [`cfe8524`](https://github.com/softistx/nxgt-janus/commit/cfe8524656fecbc21ec52f7f3a2703ed17f92bbb) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A permission's rules no longer offer or accept the permission's own name: `view: ['view']` was completed by your editor, compiled, and failed when `defineModel` ran. It is now a compile error, and a rule still names any other permission of the same type.

- [#33](https://github.com/softistx/nxgt-janus/pull/33) [`4d9ed5f`](https://github.com/softistx/nxgt-janus/commit/4d9ed5f2045efa4f6b0bd2ef09082f3f885eace1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A key other than `relations` and `permissions` on an object type of `defineModel` — `permission:`, singular — is a compile error. It compiled, and was refused only when `defineModel` ran.

## 0.1.2

### Patch Changes

- [#28](https://github.com/softistx/nxgt-janus/pull/28) [`319c940`](https://github.com/softistx/nxgt-janus/commit/319c9404d2196a8e10ced64439d161a78b0ddd0f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `defineModel` is completed by your editor: subject types and subject sets in a relation, subject types in `fromField`, and relations, permissions and arrows in a rule and in `when`. A wrong name is still refused, and the error now lists the names it could have been — with "Did you mean" when one is close. `ModelTypesOf` is exported, as the type of what a model's `types` may hold.

## 0.1.1

### Patch Changes

- [#24](https://github.com/softistx/nxgt-janus/pull/24) [`2f6f326`](https://github.com/softistx/nxgt-janus/commit/2f6f326c458665418e8ed4597c33eab5192be7e6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Identities and permissions are each usable alone, and it is now measured:
  importing `@nxgt/janus/permissions` loads no identity code, and importing
  `@nxgt/janus` loads no permission engine. The README opens with the three ways
  to use the package — identities only, permissions only, both — and the guides
  share one vocabulary, defined in `docs/guide/vocabulary.md`.
  
  Two messages now use those words: `janus: pass either user (one user type) or
  users (several user types), …`, and `defineModel: subjects must be an array of
  subject type names — auth.types from janus(), or your own`, which no longer
  suggests that permissions need `janus()`.

## 0.1.0

### Minor Changes

- [#22](https://github.com/softistx/nxgt-janus/pull/22) [`e14809e`](https://github.com/softistx/nxgt-janus/commit/e14809e2737934c73a21b2dd33dd667bc73df564) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first public release.
