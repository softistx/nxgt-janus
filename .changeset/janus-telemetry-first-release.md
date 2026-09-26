---
"@nxgt/janus-telemetry": minor
---

The first release: `instrumentJanus` and `instrumentPermissions` wrap an instance of `@nxgt/janus` so that every flow and every permission check is a span, and the security events worth an audit trail are recorded — never a login, an e-mail, a password, a session token, a one-time token or a session id.
