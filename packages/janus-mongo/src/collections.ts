import { defineCollection } from '@nxgt/mongo';
import { z } from 'zod';

/**
 * The three collections, as `@nxgt/mongo` definitions.
 *
 * **What the database holds is the port's record**, with the id under `_id`.
 * Nothing else is renamed and nothing is encoded, so a record comes back byte
 * for byte (rule 4) and a document read in a shell reads like the record in
 * the code.
 *
 * Defining them registers them with `@nxgt/mongo`, so an application that
 * deploys with `syncAll(db)` creates these three with the rest of its own.
 *
 * `@nxgt/mongo`'s optimistic lock and soft delete stay off. The port keeps its
 * own `version`, because it must tell `NOT_FOUND` from `VERSION_CONFLICT`,
 * which takes a second read the lock does not make; and the port has no
 * deletion to soften.
 */

/** Anything JSON. The core validated it against the application's schema already. */
const jsonObject = z.record(z.string(), z.unknown());
const at = z.date();

export const users = defineCollection({
	name: 'users',
	schema: z.object({
		/** The UUIDv7 the core minted. A string, never an `ObjectId`: the store mints nothing. */
		_id: z.string(),
		type: z.string(),
		schemaVersion: z.string(),
		active: z.boolean(),
		fields: jsonObject,
		logins: z.array(z.string()),
		password: z.object({ hash: z.string(), updatedAt: at }).nullable(),
		/**
		 * Absent on a user written before 0.3 — read as `null`, so no
		 * migration is needed.
		 */
		secondFactor: z
			.object({
				method: z.literal('totp'),
				secret: z.string(),
				confirmedAt: at.nullable(),
				lastStep: z.int().nonnegative().nullable(),
			})
			.nullable()
			.optional(),
		emailVerifiedAt: at.nullable(),
		version: z.int().nonnegative(),
		createdAt: at,
		updatedAt: at,
	}),
	indexes: [
		/**
		 * A login is unique **per type**: a scalar `type` and a flat array of
		 * strings, so the multikey semantics are the plain ones, no collation is
		 * needed, and the driver's `keyValue` names both the type and the login
		 * that collided.
		 */
		{
			key: { type: 1, logins: 1 },
			name: 'loginUnique',
			unique: true,
			// Without it, two users holding no login at all collide: an empty
			// array is indexed as one missing value, and a unique index admits
			// one of those per type.
			partialFilterExpression: { logins: { $type: 'string' } },
		},
		/** `listUsers` reads one type in `_id` order. */
		{ key: { type: 1, _id: 1 }, name: 'typeId' },
	],
});

export const sessions = defineCollection({
	name: 'sessions',
	schema: z.object({
		_id: z.string(),
		tokenHash: z.string(),
		userId: z.string(),
		authenticatedAt: at,
		expiresAt: at,
		revokedAt: at.nullable(),
		createdAt: at,
	}),
	indexes: [
		{
			key: { tokenHash: 1 },
			name: 'tokenHashUnique',
			unique: true,
		},
		{ key: { userId: 1 }, name: 'userId' },
		/**
		 * Storage hygiene, **not** the expiry: MongoDB's TTL monitor runs every
		 * sixty seconds, so a lapsed session stays readable for up to a minute.
		 * The core compares `expiresAt` on every read, which is what expires it.
		 */
		{
			key: { expiresAt: 1 },
			name: 'expiry',
			expireAfterSeconds: 0,
		},
	],
});

export const tokens = defineCollection({
	name: 'tokens',
	schema: z.object({
		/** The token's `sha256`. Unique by construction, so it is the key itself. */
		_id: z.string(),
		kind: z.enum([
			'verifyEmail',
			'resetPassword',
			'secondFactor',
			'signInCode',
		]),
		userId: z.string(),
		address: z.string(),
		/** Absent on a token written before 0.3 — read as `null` and `0`. */
		codeHash: z.string().nullable().optional(),
		attempts: z.int().nonnegative().optional(),
		expiresAt: at,
		spentAt: at.nullable(),
		createdAt: at,
	}),
	indexes: [
		// The same hygiene as sessions'. A token the monitor dropped is answered
		// `null`, which the port allows: a lapsed token is refused either way.
		{ key: { expiresAt: 1 }, name: 'expiry', expireAfterSeconds: 0 },
		/** `deleteUserTokens` reads one user's tokens. */
		{ key: { userId: 1 }, name: 'userId' },
	],
});

/** The three definitions, in the order `syncMongoStores` syncs them. */
export const janusCollections = [users, sessions, tokens] as const;
