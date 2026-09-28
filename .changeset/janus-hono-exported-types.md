---
'@nxgt/janus-hono': patch
---

Docs: the README's API table names the six exported types it left out — `JanusErrorsOptions`, `Bindable`, `Bound`, `BoundAuth`, `BoundSession` and `BoundPermission` — and the README and the routes guide show typing a wrapper around `janusErrors()` and passing a `bindJanus()` result to a module of routes.
