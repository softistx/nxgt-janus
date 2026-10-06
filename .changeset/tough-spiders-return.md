---
'@nxgt/janus': patch
---

The exported error classes now define their fields as class fields (`useDefineForClassFields`, aligned with nxgt-data). Instances are otherwise identical, with the same own keys in the same order.

One edge changes: a consumer subclass that declares an accessor for `name`, `code` or an option field such as `userId` or `slot` now has that accessor shadowed by an own data property on the instance. Before, the accessor threw `Attempted to assign to readonly property` (getter only) or was called with the base value (setter). Declare such a field as a class field in the subclass instead.

The JS of `@nxgt/janus-hono`, `@nxgt/janus-mail`, `@nxgt/janus-mongo` and `@nxgt/janus-graphql` also changed (bracket access and an explicit `return;`), with identical behaviour, so they are not bumped.
