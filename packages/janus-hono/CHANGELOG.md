# @nxgt/janus-hono

## 0.1.0

### Minor Changes

- [#38](https://github.com/softistx/nxgt-janus/pull/38) [`9f75a58`](https://github.com/softistx/nxgt-janus/commit/9f75a58767ed5d6a1b7eaeee6f0b732c5c287a19) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `@nxgt/janus` in a Hono app. `session()` sets the signed-in user on every request and sends a renewed cookie again; `sendSession` and `signOut` set and clear the cookie; `permission()` guards a route with a permission of the model and hands it the loaded object, with `byParam` as its loader; `provide()` puts the instances on the context; `janusErrors()` answers every error with its status — an outage as 503, never 401 or 403; `bindJanus()` binds them all to the instances once.

### Patch Changes

- Updated dependencies [[`fe5bbfd`](https://github.com/softistx/nxgt-janus/commit/fe5bbfd26bad216941d8743541f579ea485d81b1), [`cfe8524`](https://github.com/softistx/nxgt-janus/commit/cfe8524656fecbc21ec52f7f3a2703ed17f92bbb), [`4d9ed5f`](https://github.com/softistx/nxgt-janus/commit/4d9ed5f2045efa4f6b0bd2ef09082f3f885eace1)]:
  - @nxgt/janus@0.1.3
