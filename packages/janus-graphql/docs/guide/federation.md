# Federation

This page is for a subgraph of a federated graph: where the directives are
checked, how the router must forward the request, and how to keep them in
the supergraph with `@composeDirective`.

## Checked in the subgraph

`useJanus()` guards the schema of the server it is plugged into. In a
federated graph that is the subgraph: each subgraph that serves a guarded
field runs its own `useJanus({ auth, access })`, and checks the directive
when the router asks it for the field. Nothing is checked by the router.

So **the router must forward what `authenticate` reads**: the
`Authorization` header, `X-Session-Token`, or the session cookie. A router
that forwards none of them turns every signed-in user into an anonymous one,
answered `UNAUTHENTICATED` by the subgraph. Configure header propagation in
the router for the subgraphs that use this package.

An entity's fields are guarded as any object type's: a type-level
`@permission` reads `parent.id`, and the parent is what your
`__resolveReference` answered, so it carries the fields its `fromField`s
read when your reference resolver loads them.

```graphql
type Record @key(fields: "id") @permission(name: "view", type: "record") {
	id: ID!
	title: String
}
```

## The shipped SDL

The directives and the `JanusPermissionDenial` enum ship twice, as the same text:
`janusTypeDefs`, and `graphql/janus.graphqls` in the package —
`node_modules/@nxgt/janus-graphql/graphql/janus.graphqls`. Composition
requires a directive to be declared identically in every subgraph that
composes it, and reading it from the package, rather than copying it, keeps
every subgraph on the definition of the version it installed.

A subgraph built with `@apollo/subgraph` or `@graphql-tools/federation`
takes `janusTypeDefs` among its type definitions, like any server; a
schema-first toolchain reads the file.

## Keeping the directives in the supergraph

Composition drops a subgraph's own directives from the supergraph unless
they are composed. The checks do not need them there — they run in the
subgraph — but a client generator or a schema registry reading the
supergraph does, to show which fields are guarded. Link them under a
specification URL of your own and compose them:

```graphql
extend schema
	@link(url: "https://specs.apollo.dev/federation/v2.1", import: ["@key", "@composeDirective"])
	@link(url: "https://example.com/janus/v1.0", import: ["@authenticated", "@fresh", "@permission"])
	@composeDirective(name: "@authenticated")
	@composeDirective(name: "@fresh")
	@composeDirective(name: "@permission")
```

Every subgraph that composes a directive must declare it identically, which
the shipped SDL does, and link it under the same URL, with the same major
version.

**Do not import federation's own `@authenticated`.** Federation 2.5 declares
a directive of that name, read by the router, and a subgraph that imports it
from the federation `@link` while declaring `janusTypeDefs` has two
definitions of one name. Import only what you use from the federation
specification — `@key`, `@composeDirective` — and let this package's
`@authenticated` be the one the subgraph checks.
