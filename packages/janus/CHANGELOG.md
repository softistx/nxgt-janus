# @nxgt/janus

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
