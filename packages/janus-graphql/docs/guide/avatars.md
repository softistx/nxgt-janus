# Account avatars

This page is for putting an account's avatar in your schema: `JanusAvatar`,
the parent a field returns, and the `url(size:)` that points at **your own
authenticated route**. It is opt-in: nothing here is declared by `janusTypeDefs`,
and a server that wants no avatars imports none of it.

`@nxgt/janus` keeps only the avatar's id — `user.avatar`, `{ id, updatedAt } |
null` — and your application keeps the bytes. This package does not serve
them: it builds the URL of the route that does. That route, the upload and
the privacy rule are in [`@nxgt/janus`'s avatars
guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/avatars.md).

## The schema

```ts
import {
	avatarResolvers,
	janusAvatarTypeDefs,
	janusTypeDefs,
	requireUser,
	toJanusAvatar,
} from '@nxgt/janus-graphql';
import { createSchema } from 'graphql-yoga';

const typeDefs = /* GraphQL */ `
	type Viewer {
		id: ID!
		name: String!
		avatar: JanusAvatar @permission(name: "viewAvatar", type: "user", id: "parent.id")
	}
	type Query {
		viewer: Viewer @authenticated
	}
`;

export const schema = createSchema({
	typeDefs: [janusTypeDefs, janusAvatarTypeDefs, typeDefs],
	resolvers: {
		...avatarResolvers({
			// where the app's own route lives: it checks the session and the access rule
			url: ({ userId, id }, size) => `/avatars/${userId}/${size}?v=${encodeURIComponent(id)}`,
		}),
		Query: { viewer: (_, __, ctx) => requireUser(ctx) },
		Viewer: { avatar: (user) => toJanusAvatar(user) },
	},
});
```

`janusAvatarTypeDefs` ships twice, like `janusTypeDefs`: a string, and
`graphql/janus-avatar.graphqls` in the package, held identical by a spec.

```graphql
type JanusAvatar {
	id: ID!
	updatedAt: String!
	url(size: Int!): String!
}
```

- **`id`** is the id your application stored the image under — new with every
  upload.
- **`updatedAt`** is an ISO-8601 string, for example
  `2026-10-24T08:30:00.000Z`. It is a `String`, not a `DateTime`, so the
  package needs no scalar and cannot collide with the one your schema already
  declares; parse it on the client.
- **`url(size:)`** is what your `url` function answers.

Put `avatar: JanusAvatar` on the types you own — `Viewer`, `Member` — and
return `toJanusAvatar(user)` from the field: `null` for a user with no
avatar, else the parent `JanusAvatar`'s resolvers read.

## The `url` function

`url(avatar, size)` receives the `AvatarParent` — `{ userId, id, updatedAt }`:
the account, its current avatar id and when it was set; a route needs
at least the first two — and the size. Answer the path of **a route of yours** and put the
id in it (`?v=${encodeURIComponent(id)}`; ids are the application's own
strings, so encode them): a new upload has a new id, so the browser's cache fetches
the new image and keeps the old one for the old URL.

`size` reaches `url` as a positive integer. GraphQL itself refuses a value
that is not an `Int`; a `size` of `0` or below is refused `BAD_USER_INPUT`,
status 400, by the resolver. Which positive sizes you store is
your route's to decide — it answers 404 for the others.

## Who may see an avatar

The field is as open as you leave it. Guard it as any other:

```graphql
avatar: JanusAvatar @permission(name: "viewAvatar", type: "user", id: "parent.id")
```

`@permission` with `id: "parent.id"` asks `access.can` about the parent itself,
so no loader is needed. That is right only when the field's parent object is
the janus user: on a `Member` type whose parent is a membership row,
`parent.id` is the membership's, not the account's — name the account's id
field or guard in the resolver. A loader is required only for an `args.*` id, or a
`parent.<field>` other than `id`, on a type whose `fromField` reads the
object. A denied field is an error (`NOT_FOUND`). To answer `null` instead, check in the
resolver:

```ts
Viewer: {
	avatar: async (user, _args, ctx) =>
		(await can(ctx, 'viewAvatar', user)) ? toJanusAvatar(user) : null,
},
```

**The field decides who learns the URL; the route decides who gets the
bytes.** Check the session and the rule in the route as well — a URL leaks
through a log, a screenshot or a pasted link, and a route that serves whoever
asks makes the URL a public one.

## Traps

- **The URL must point at a route that checks the session and the access
  rule**, never a public or signed bucket URL — the reason is in
  [`@nxgt/janus`'s avatars guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/avatars.md).
- **`toJanusAvatar` and `avatarResolvers` check nothing.** Guard the field.
- **The size is not capped here.** `url(size: 100000)` is a string like any
  other; your route refuses the sizes it does not store.

## See also

- [`@nxgt/janus`'s avatars guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/avatars.md) — the upload and proxy routes, and the privacy recipe
- [Directives](directives.md) — `@permission`, its ids and its loaders
- [Troubleshooting](../troubleshooting.md#bad_user_input-400-size-must-be-a-positive-integer) — the `size must be a positive integer` error
