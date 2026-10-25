---
"@nxgt/janus-graphql": minor
---

An opt-in avatar surface: `janusAvatarTypeDefs` (also `graphql/janus-avatar.graphqls`), `type JanusAvatar { id: ID!, updatedAt: String!, url(size: Int!): String! }`, with `toJanusAvatar(user)` for the parent of an `avatar: JanusAvatar` field of your own types and `avatarResolvers({ url })` for its fields. `url` builds the path of your own authenticated route — never a public URL — and `updatedAt` is an ISO-8601 string, so no scalar is needed. A `size` below 1 is refused `BAD_USER_INPUT`, 400. Needs `@nxgt/janus` 0.29.0 for `user.avatar`. Nothing changes for a server that does not import them.
