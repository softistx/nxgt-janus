# Account avatars

This page is the full recipe for giving accounts an avatar: the upload route,
the remove route, the route that serves the image, who may see it, and what
fails in what order. Janus is a small part of it: **it records which image is
the account's — an opaque id your application chose — and stores no bytes.**
Storing, processing, serving and deleting the image is your application's,
in whatever storage it already runs.

The calls it adds are `auth.avatar.set` and `auth.avatar.remove` on an instance
of one user type (with several, `auth.<type>.avatar.set`, and the same at the
root for a page that holds only an id; the reference is in [the README](../../README.md#avatars--avatar)); the
avatar is read back as `user.avatar`, `{ id, updatedAt } | null`.

The image side below is written with [`@nxgt/image`](https://www.npmjs.com/package/@nxgt/image)
0.1 and its `@nxgt/image/s3` subpath over `@nxgt/s3`, **for example**: any
storage works, since janus keeps only the id. Its calls — `defineImageSet`,
`bindImageStore`, `store.replace`, `store.remove`, `store.bytes` — are the
ones the recipe uses; swap them for your own storage calls. `@nxgt/image` runs
on Bun 1.4.1 or later only, and its bucket must accept `image/webp` and a
`maxSize` of at least the largest size: see its README and `docs/guide/storing.md`.

## What you decide, and what janus does

| | |
| --- | --- |
| The id | Yours: `crypto.randomUUID()`, a **new one for every upload** |
| The bytes | Yours: processed, stored, served and deleted by your application |
| The record | Janus's: `user.avatar`, written by `avatar.set` / `avatar.remove` |
| Who may change it | Yours: janus has **no access check** on either call |
| Who may see it | Yours: janus has no access check on `user.avatar` either |
| Reading | A stream through **your own authenticated route** — see *Never a public URL* in the traps |
| History | None: only the current image is kept |

## The image store

```ts
import { defineImageSet, ImageError } from '@nxgt/image';
import { bindImageStore } from '@nxgt/image/s3';
import { bindBucket, defineBucket } from '@nxgt/s3';

const sizes = [256, 64]; // the only sizes the proxy route will serve

const avatarBucket = defineBucket({
	bucket: 'avatars',
	// a fresh imageId per upload, so a new image never lands on the former one's keys
	key: (p: { imageId: string; size: number }) => `avatars/${p.imageId}/${p.size}.webp`,
});

const s3Config = { endpoint: env.S3_ENDPOINT, accessKeyId: env.S3_KEY, secretAccessKey: env.S3_SECRET };

export const store = bindImageStore(
	defineImageSet({ sizes }), // limits, quality: see the @nxgt/image README
	bindBucket(avatarBucket, s3Config), // never with a public default acl
);
// store.replace({ imageId }, input)  — decode, resize, write every size
// store.remove({ imageId })          — delete every size
// store.bytes({ imageId }, size)     — the stored bytes of one size
```

A refused image throws an `ImageError` whose `code` is `TOO_LARGE`,
`UNSUPPORTED_TYPE`, `UNDECODABLE` or `TOO_SMALL`: answer it with a 4xx of
your own.

## 1. The upload route

Any HTTP framework; this one is Hono-like. The order is the point: **session,
fresh id, bytes, record, then the former image.**

```ts
import { bodyLimit } from 'hono/body-limit';

app.put(
	'/me/avatar',
	// Before the body is read: `arrayBuffer()` below holds the whole upload in
	// memory, so a limit in front of the route stops a huge body before it does.
	bodyLimit({ maxSize: 5 * 1024 * 1024, onError: (c) => c.body(null, 413) }),
	async (c) => {
		const current = await auth.authenticate(c.req.raw); // 1. who is asking
		if (current === null) return c.body(null, 401);
		const userId = current.user.id; // only ever the caller's own avatar

		const imageId = crypto.randomUUID(); // 2. a new id for every upload
		try {
			await store.replace({ imageId }, await c.req.arrayBuffer()); // 3. the bytes FIRST
		} catch (error) {
			if (error instanceof ImageError) {
				return c.json({ code: error.code }, error.code === 'TOO_LARGE' ? 413 : 422);
			}
			throw error;
		}

		const former = current.user.avatar?.id ?? null; // read before the call (webhook-only receivers)
		try {
			await auth.avatar.set(userId, { id: imageId }); // 4. then the record
		} catch (error) {
			await store.remove({ imageId }); // any failure: nothing points at this upload
			throw error;
		}
		if (former !== null) await store.remove({ imageId: former }); // 5. then the former image
		return c.json({ id: imageId }, 200);
	},
);
```

The body limit is the route's, not janus's: `c.req.arrayBuffer()` reads the
whole body before `@nxgt/image` can refuse it as `TOO_LARGE`, so without a
limit in front, one large request is held in memory first. Any equivalent —
the framework's, or the reverse proxy's — does the same.

Step 5 has two homes. In the process that wrote, the `janus({ events })`
listener hears `user.avatarChanged` with `formerAvatarId` — see
[user events](events.md#what-an-event-carries) — and is the one place that
deletes the former image whichever route changed it:

```ts
const auth = janus({
	...config,
	async events(event) {
		if (
			(event.type === 'user.avatarChanged' || event.type === 'user.avatarRemoved') &&
			event.formerAvatarId != null
		) {
			await store.remove({ imageId: event.formerAvatarId });
		}
	},
});
```

With that listener, drop step 5 from the route. A receiver that only gets
**webhooks** never sees `formerAvatarId` (`@nxgt/janus-webhooks` strips it),
so it reads `user.avatar?.id` before the call, as the route above does, and
deletes that image once the call answered.

## 2. The remove route

```ts
app.delete('/me/avatar', async (c) => {
	const current = await auth.authenticate(c.req.raw);
	if (current === null) return c.body(null, 401);

	const former = current.user.avatar?.id ?? null;
	await auth.avatar.remove(current.user.id); // the record first: nothing points at the bytes any more
	if (former !== null) await store.remove({ imageId: former }); // then the bytes (or the listener above)
	return c.body(null, 204);
});
```

Removing the record before the bytes is the safe order here too: a failure
in between leaves an orphan image, never a record pointing at nothing.
`avatar.remove` on a user with no avatar writes and sends nothing.

## 3. The proxy route

Reading is a stream through your application, behind its session and its
access rule. The `url` a client holds points here.

```ts
app.get('/avatars/:userId/:size', async (c) => {
	const current = await auth.authenticate(c.req.raw);
	if (current === null) return c.body(null, 401);

	const { userId } = c.req.param();
	const size = Number(c.req.param('size'));
	if (!sizes.includes(size)) return c.body(null, 404); // only the sizes you store

	const user = await auth.find(userId);
	if (user === null || !(await canViewAvatar(current.user, user))) return c.body(null, 404); // the access check
	if (user.avatar === null) return c.body(null, 404); // no avatar

	const etag = `"${user.avatar.id}"`; // a new upload is a new id, so a new ETag
	const cache = 'private, no-cache'; // revalidate on every view, so the access check re-runs
	if (c.req.header('If-None-Match') === etag) {
		return c.body(null, 304, { ETag: etag, 'Cache-Control': cache });
	}
	const bytes = await store.bytes({ imageId: user.avatar.id }, size);
	if (bytes === undefined) return c.body(null, 404); // the record outlived its bytes
	return new Response(bytes, {
		headers: {
			'Content-Type': 'image/webp',
			'Cache-Control': cache, // private: never a shared cache or a CDN
			ETag: etag,
		},
	});
});
```

Answer **404 when the caller may not see it**, as you would for an account
that does not exist: a 403 tells them the account has an avatar. The
`?v=<id>` your GraphQL `url` adds is for the browser's cache only; the route
reads the current avatar, never the one the query names. Put the id in a
`?v=` with `encodeURIComponent(id)`: ids are the application's own strings.

The `ETag` is built from the id and quoted, as the header requires. That is
fine for a UUID; an id you choose yourself must not hold a `"` or a control
character, or the header is malformed.

## 4. Who may see an account: a privacy recipe

Janus has no organizations, so "an account is visible to the members of an
organization it belongs to" is yours to enforce — with
[`@nxgt/janus/permissions`](permissions.md). Model the organization's members,
and give each account a `viewAvatar` permission that is its own owner or
anyone in an organization it belongs to:

```ts
import { defineModel, fromField, permissions } from '@nxgt/janus/permissions';

const model = defineModel({
	subjects: auth.types, // ['user']
	types: {
		organization: {
			related: { members: ['user'] },
		},
		user: {
			related: {
				self: fromField('id', 'user'), // the account itself, read from its own id
				viewers: ['organization#members'], // every member of an organization it belongs to
			},
			permits: { viewAvatar: ['self', 'viewers'] },
		},
	},
});

export const access = permissions({ model, store: relations }); // relations: your relation store
```

**Granted when a membership is created, revoked when it ends** — beside your
own membership write, so the two never drift:

```ts
async function addMember(user: { type: 'user'; id: string }, organizationId: string) {
	const organization = { type: 'organization', id: organizationId } as const;
	await access.grant(organization, 'members', user);
	// the account is now visible to every member of the organization:
	await access.grant(user, 'viewers', { ...organization, relation: 'members' });
}

async function removeMember(user: { type: 'user'; id: string }, organizationId: string) {
	const organization = { type: 'organization', id: organizationId } as const;
	await access.revoke(user, 'viewers', { ...organization, relation: 'members' });
	await access.revoke(organization, 'members', user);
}
```

Both calls are idempotent, so a retry is safe. The subject set follows the
data as it stands: a member added to the organization later sees every
account granted to its members, with no new tuple.

**Check it in the proxy route** — the `canViewAvatar` of step 3:

```ts
const canViewAvatar = (viewer: { type: 'user'; id: string }, owner: { type: 'user'; id: string }) =>
	access.can(viewer, 'viewAvatar', owner); // a user passed as it is, is that user
```

`can()` answers `false` for a denial and throws `STORE_FAILED` for an
outage: answer the outage 503, never 404.

**And on the GraphQL field**, with
[`@nxgt/janus-graphql`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-graphql/docs/guide/avatars.md), either
the directive or `can()`:

```graphql
type Member {
	id: ID!
	avatar: JanusAvatar @permission(name: "viewAvatar", type: "user", id: "parent.id")
}
```

The directive's ids, loaders and the `null`-on-deny alternative are in
[the GraphQL avatars guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-graphql/docs/guide/avatars.md#who-may-see-an-avatar).

## 5. Failure order and traps

- **Bytes before the record.** If `avatar.set` fails after the bytes were
  written, the image is an orphan nobody points at; the other order could
  leave a record pointing at bytes that were never written. An orphan costs
  storage; a dangling record costs a broken image.
- **A fresh id for every upload.** `store.replace` writes under keys built
  from its params. Reusing the user's id overwrites the image they are
  showing, and the later removal of the former image — the same id — deletes
  the new one. Janus refuses an id that is not a non-empty string of at most
  512 characters that every store can keep (no NUL, no lone surrogate;
  `AVATAR_ID_INVALID`) and nothing else.
- **Setting the same id is a no-op**: no write, no event, so no former image
  to delete.
- **Janus has no access check.** `avatar.set`, `avatar.remove`, `find` and
  `get` answer whoever calls them. Check the session and the rule before
  each, as the routes above do.
- **Webhooks strip `formerAvatarId`.** Delete the former image from the
  in-process listener, or read `user.avatar?.id` before the call.
- **`Cache-Control: private, no-cache`, not `max-age`.** `no-cache` lets the
  browser keep the bytes but makes it ask the route on every view, so the
  access check runs again: a member removed from an organization stops seeing
  its accounts' images at the next view, and an unchanged image costs one 304.
  A `max-age=86400` would serve a revoked viewer the cached image for a day,
  with no request to refuse. `private` keeps a shared cache or a CDN out.
- **`VERSION_CONFLICT` is not only a stale `ifVersion`.** Any write that
  landed between the read and the write conflicts too, with or without an
  `ifVersion` of yours: a sign-in that rehashed the password is one. Delete
  your fresh upload on any failure of `avatar.set`, as the route above does.
- **Never a public URL.** A public bucket or a signed URL needs no session:
  anyone holding the link, an ex-member included, keeps seeing the image.
  The proxy route is what makes the rule above hold.
- **Deploy the schema first.** `avatar` is a column or a document field, and
  the two adapters fail differently before it exists. On MongoDB, run
  `syncMongoStores(db)` before the release that calls `avatar.set` or
  `avatar.remove`: until then only a write that sets an avatar fails, with
  `STORE_FAILED`. On PostgreSQL, run the
  [drizzle migration](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-drizzle/docs/guide/migrations.md)
  before the release at all: the columns are missing, so every query on
  `users` fails with `STORE_FAILED`, sign-in included.
- **An avatar set before the address was proven is not cleared by the
  proof.** The first e-mail proof clears the password and the second factor
  of a user who registered an address they do not own (a squatter's), but not
  the avatar. An application that shows avatars of unverified accounts calls
  `avatar.remove` for a user whose `user.emailVerified` has just turned true, or does
  not show the avatar of a user whose `emailVerified` is `false`.
- **Delete the account's image with the account.** `user.deleted` carries
  no avatar id: read `user.avatar?.id` before calling `delete`, and remove
  that image once it answered.

## See also

- [User events](events.md) — `user.avatarChanged`, `user.avatarRemoved` and `formerAvatarId`
- [Users](users.md) — `user.avatar` and the reserved name
- [Permissions](permissions.md) — `defineModel`, `fromField`, `grant`, `can`
- [`@nxgt/janus-graphql`'s avatar guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-graphql/docs/guide/avatars.md) — the `JanusAvatar` type and its `url(size:)`
