---
'@nxgt/janus-hono': minor
---

`fresh(maxAge, { clock? })`: a middleware, behind `session(auth)`, that lets a route run only for a session that proved who it is less than `maxAge` ago — signed in, or confirmed since by `auth.stepUp.confirm`. An older one throws `STEP_UP_REQUIRED`, which `janusErrors()` answers 403 with `{ code: 'STEP_UP_REQUIRED' }`; an anonymous request is answered 401. A `maxAge` that is not a duration is a `TypeError` when the app is wired. Needs `@nxgt/janus` 0.12.
