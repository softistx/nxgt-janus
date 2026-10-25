---
"@nxgt/janus": patch
---

The avatars guide now follows the published `@nxgt/image` 0.1.0: `bindImageStore` comes from `@nxgt/image/s3` and takes a `@nxgt/s3` bucket bound with `bindBucket`, keyed by a fresh `imageId` per upload.
