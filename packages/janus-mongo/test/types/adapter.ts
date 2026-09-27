/**
 * What the adapter refuses at compile time: each `@ts-expect-error` is a
 * plausible mistake that must not compile. The calls without one are the
 * correct shapes, which must keep compiling.
 */

import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { connectMongo } from '@nxgt/mongo';
import { z } from 'zod';
import {
	createMongoAdapter,
	createMongoRelations,
	createMongoStores,
	syncMongoAdapter,
	syncMongoRelations,
	syncMongoStores,
} from '../../src/index';

const connection = await connectMongo('mongodb://localhost:27017/app');
const { db } = connection;

// @ts-expect-error 1. a URI: the adapter connects to nothing
createMongoStores('mongodb://localhost:27017/app');
// @ts-expect-error 2. @nxgt/mongo's connection: the adapter takes its `db`
createMongoAdapter(connection);
// @ts-expect-error 3. the driver's client: the adapter takes one of its databases
createMongoRelations(connection.client);
// @ts-expect-error 4. the connection again, to the adapter's deployment step
await syncMongoAdapter(connection);
// @ts-expect-error 5. the connection to the relations' deployment step
await syncMongoRelations(connection);
// @ts-expect-error 6. the promise `connectMongo` answers, not awaited
createMongoStores(connectMongo('mongodb://localhost:27017/app'));
// @ts-expect-error 7. a sync option in the wrong case: `dryRun`
await syncMongoStores(db, { dryrun: true });
await syncMongoAdapter(db, { dryRun: true });
await syncMongoRelations(db);

const User = z.strictObject({ email: z.email() });
const mongo = createMongoAdapter(db);

export const auth = janus({
	user: User,
	password: { login: 'email' },
	hasher: scryptHasher(),
	...mongo,
});

export const identitiesAlone = janus({
	user: User,
	password: { login: 'email' },
	hasher: scryptHasher(),
	store: createMongoStores(db),
});

export const whole = janus({
	user: User,
	password: { login: 'email' },
	hasher: scryptHasher(),
	// @ts-expect-error 8. the whole adapter as `store`: spread it, or take `mongo.store`
	store: mongo,
});

export const swapped = janus({
	user: User,
	password: { login: 'email' },
	hasher: scryptHasher(),
	// @ts-expect-error 9. the relation store as the identity stores
	store: createMongoRelations(db),
});

const model = defineModel({
	subjects: auth.types,
	types: { record: { related: { owners: ['user'] } } },
});

export const access = permissions({ model, store: mongo.relations });

// @ts-expect-error 10. the whole adapter as the relation store: take `mongo.relations`
permissions({ model, store: mongo });
// @ts-expect-error 11. the identity stores as the relation store
permissions({ model, store: createMongoStores(db) });
