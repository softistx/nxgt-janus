---
"@nxgt/janus": minor
---

`access.holders` has a bounded cost per page when `matches` keeps few holders. A call looks at most `scanLimit` holders (500 when absent, or `Infinity` to opt out); once that is spent it answers the holders kept so far, possibly none, with a `nextCursor` to resume from, so a page may hold fewer than `first` and only a `null` `nextCursor` marks the last one. The new `matchesMany(holders) => boolean[]` is the batched predicate: it is called with up to 100 holders at a time, so a caller reads a page's users in one query; it excludes `matches`. A relation of more than 500 holders whose filter keeps few of them used to be scanned whole in one call and now needs several, following `nextCursor` (fixes #276).
