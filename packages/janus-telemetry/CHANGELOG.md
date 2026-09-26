# @nxgt/janus-telemetry

## 0.1.0

### Minor Changes

- [#55](https://github.com/softistx/nxgt-janus/pull/55) [`ebe6b61`](https://github.com/softistx/nxgt-janus/commit/ebe6b6102bde1d78e52991ba9a41f019ac92452e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `instrumentJanus` and `instrumentPermissions` wrap an instance of `@nxgt/janus` so that every flow and every permission check is a span, and the security events worth an audit trail are recorded — never a login, an e-mail, a password, a session token, a one-time token or a session id.

### Patch Changes

- Updated dependencies [[`b04520d`](https://github.com/softistx/nxgt-janus/commit/b04520df723cedb49863058d10124ee0968dd904)]:
  - @nxgt/janus@0.2.2
