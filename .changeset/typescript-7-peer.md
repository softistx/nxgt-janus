---
'@nxgt/janus-drizzle': patch
'@nxgt/janus-graphql': patch
'@nxgt/janus-hono': patch
'@nxgt/janus-kit': patch
'@nxgt/janus-mail': patch
'@nxgt/janus-mongo': patch
'@nxgt/janus-redis': patch
'@nxgt/janus-telemetry': patch
'@nxgt/janus-webhooks-redis': patch
'@nxgt/janus-webhooks': patch
'@nxgt/janus': patch
---

Accept TypeScript 7 as well as 6: the `typescript` peer is `^6.0.3 || ^7.0.0`. The packages use TypeScript for its type-level API only, and the type tests, including every compile-time refusal, pass under 7.0.2.
