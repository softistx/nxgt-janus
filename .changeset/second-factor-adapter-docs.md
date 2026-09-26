---
"@nxgt/janus-drizzle": patch
"@nxgt/janus-mongo": patch
---

The second factor's secret is described as it now is: sealed by `@nxgt/janus` with AES-256-GCM before the store sees it. The docs add a query to find secrets still sealed with a key you are rotating out.
