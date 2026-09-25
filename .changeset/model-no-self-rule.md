---
"@nxgt/janus": patch
---

A permission's rules no longer offer or accept the permission's own name: `view: ['view']` was completed by your editor, compiled, and failed when `defineModel` ran. It is now a compile error, and a rule still names any other permission of the same type.
