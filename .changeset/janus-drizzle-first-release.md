---
"@nxgt/janus-drizzle": minor
---

The first release: both sides of `@nxgt/janus` — users, sessions, one-time tokens and the relation store — over one PostgreSQL database, on Drizzle and `@nxgt/drizzle`. `defineJanusTables({ schema? })` gives the tables your drizzle-kit migrations create, in a database or a schema of their own. It passes both conformance suites on PostgreSQL 17 and PGlite.
