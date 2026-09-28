---
'@nxgt/janus-graphql': minor
---

Subscriptions over graphql-ws: `janusConnection({ auth, access?, type?, clock?, upgrade? })` answers `onConnect` for graphql-ws's `useServer()`, which authenticates a WebSocket connection from `connectionParams.authorization` — else from the upgrade request's headers and session cookie — and refuses it `4403`, or rejects on an outage so the socket closes `4500`. In Yoga's recommended setup, `useJanus()` builds each operation's `ctx.janus` from that connection's credential, so `@authenticated`, `@fresh` and `@permission` hold unchanged; `context` builds it for a server without Yoga, and `upgrade` reads the upgrade request on Bun. `graphql-ws` is an optional peer, `^6.0.0`.
