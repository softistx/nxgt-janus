# Troubleshooting `@nxgt/janus-hono`

Each entry is headed by what you see: a status, a compiler error, a missing
cookie. Search this page for its words.

This package **defines no error class**. What reaches `app.onError` is one of
`@nxgt/janus`'s errors, and the codes are those of the core — see
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md)
for what causes each.

## Index

- [Every refusal is a 500](#every-refusal-is-a-500)
- [A signed-in user gets 401](#a-signed-in-user-gets-401)
- [`'c.var.user' is possibly 'null'`](#cvaruser-is-possibly-null)
- [`Property 'user' does not exist` on `c.var`](#property-user-does-not-exist-on-cvar)
- [The browser never sends the cookie back](#the-browser-never-sends-the-cookie-back)
- [A bearer client's session expires although it is used](#a-bearer-clients-session-expires-although-it-is-used)
- [Everything answers 503](#everything-answers-503)

## Every refusal is a 500

**Cause:** `app.onError(janusErrors())` is missing, or was set on another
`Hono` instance than the one that ran the route. Hono then answers every
thrown error with its own 500.

**Fix:** set it on the app that serves the request. A sub-app mounted with
`app.route()` that has its own `onError` uses that one.

## A signed-in user gets 401

**Cause**, in the order to check:

1. The route passes `type`, and the user is of another type. The session is
   fine; it does not sign that user in on this route.
2. The request presents two credentials, and the first one is stale. **The
   first present wins, not the first valid one**: a lapsed `Authorization:
   Bearer` beside a live cookie is anonymous.
3. The session lapsed, was revoked — `signOut`, `signOutEverywhere`, a password
   reset — or the user was deactivated.

**Fix:** for 2, stop sending the stale header. For the rest, it is the answer
you asked for.

## `'c.var.user' is possibly 'null'`

**Cause:** the route does not require a user, so an anonymous request reaches
it.

**Fix:** `session(auth, { required: true })`, or check `c.var.user === null`
and answer yourself.

## `Property 'user' does not exist` on `c.var`

**Cause:** `app.use(session(auth))` was called on its own line. Hono types a
chain of calls, not separate statements.

**Fix:** declare the app with `new Hono<SessionEnv<typeof auth>>()`, or pass
`session(auth)` to the route itself.

## The browser never sends the cookie back

**Cause:** the cookie is `Secure` by default, and the page is served over plain
`http://` on a host other than `localhost`. Or `SameSite=Lax` (the default)
drops it from a cross-site `POST`.

**Fix:** serve over HTTPS. For a development server off `localhost`, set
`cookie: { secure: false }` in `janus()` — never in production. For a
cross-site front end, `cookie: { sameSite: 'none' }`, which requires `secure`.

## A bearer client's session expires although it is used

**Cause:** it is not expiring; it was renewed, and the client does not know.
Renewal moves `session.expiresAt` in the store, and a bearer client is never
sent a cookie saying so.

**Fix:** nothing to fix unless the client caches the expiry. If it does,
answer `c.var.session.expiresAt` from a route it calls.

## Everything answers 503

**Cause:** a store cannot answer. `session()` calls the sessions store on every
request that presents a token, and **an outage is never anonymous**: it is
`STORE_FAILED`, answered 503, so that nobody is told they are signed out while
the database is down.

**Fix:** the database. The error's `slot` and `operation` name the store and
the call; its `cause` is the driver's error.
