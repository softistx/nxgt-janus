# Health and closing

This page covers:
- `kit.ping()`, for a health route;
- `kit.close()`, and who closes what;
- `kit.db` and `kit.redis`, the connections the kit holds.

## `kit.ping(options?)`

```ts
const health = await kit.ping({ timeoutMs: 1_000 }); // 2 s by default
// { ok: true, postgres: { ok: true, latencyMs: 1.2 }, redis: { ok: true, latencyMs: 0.4 } }
```

It sends `select 1` to PostgreSQL and `PING` to Redis, at once, each within
`timeoutMs`. `redis` is there only when Redis is wired. **It never throws**: a
database that does not answer is `{ ok: false, error }`, and `ok` at the top
is `false`, so a health route always has something to report:

```ts
app.get('/health', async (c) => {
	const health = await kit.ping();
	return c.json({ ok: health.ok }, health.ok ? 200 : 503);
});
```

Do not send `error` to the client: it is the driver's, and may name a host.

## `kit.close()`

```ts
await kit.close();
// or, for a script or a test:
await using kit = await connectKit(config);
```

It closes what the kit opened, Redis first, then PostgreSQL, and nothing it
was handed: a `postgres.db` or a `redis.connection` from the configuration
stays open, since it is not the kit's to close. It is idempotent.

After it, every call through `kit.auth` fails with `STORE_FAILED`, and
`kit.ping()` answers `ok: false`.

`@nxgt/redis` shares one client per URL: the client closes with the last
connection to it, so a connection your application opened to the same URL
keeps it open.

## `kit.db` and `kit.redis`

`kit.db` is the Drizzle instance over Janus's database, for a query of your
own: an admin page, a report. Read, never write: a row written behind the
stores skips their invariants.

`kit.redis` is the `@nxgt/redis` connection, or `undefined` without Redis.
