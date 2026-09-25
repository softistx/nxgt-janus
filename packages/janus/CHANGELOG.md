# @nxgt/janus

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
