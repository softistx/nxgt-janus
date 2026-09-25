---
'@nxgt/janus-hono': minor
---

The first release: `@nxgt/janus` in a Hono app. `session()` sets the signed-in user on every request and sends a renewed cookie again; `sendSession` and `signOut` set and clear the cookie; `permission()` guards a route with a permission of the model and hands it the loaded object, with `byParam` as its loader; `provide()` puts the instances on the context; `janusErrors()` answers every error with its status — an outage as 503, never 401 or 403; `bindJanus()` binds them all to the instances once.
