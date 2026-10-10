import type { UserPatch, UserRecord, UserStore } from '@nxgt/janus';
import { NotFoundError, StoreConflict } from '@nxgt/janus';
import { getCollection, type TypedCollection } from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { users } from '../collections';
import { refuseDuplicate, run, settle } from '../translate';
import { toUser, toUserDocument, toUserSet } from './records';

type Users = TypedCollection<typeof users>;

export function userStore(db: Db): UserStore {
	const collection = getCollection(db, users);
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('users', operation, body);

	return {
		insertUser: (record) =>
			run$('insertUser', () => insertUser(collection, record)),

		findUser: (id) => run$('findUser', () => findUser(collection, id)),

		// One query, whatever the number of ids: the core sends at most 100,
		// distinct, and puts the answer back in its caller's order.
		findUsers: (ids) =>
			run$('findUsers', async () => {
				const found = await collection.findMany({
					filter: { _id: { $in: [...ids] } },
				});
				return found.map(toUser);
			}),

		findUserByLogin: (type, login) =>
			run$('findUserByLogin', async () => {
				const found = await collection.findFirst({ type, logins: login });
				return found === undefined ? null : toUser(found);
			}),

		listUsers: ({ type, after, limit }) =>
			run$('listUsers', async () => {
				// One more than the page, to know whether another follows.
				const found = await collection.findMany({
					filter: after === null ? { type } : { type, _id: { $gt: after } },
					sort: { _id: 1 },
					limit: limit + 1,
				});
				const items = found.slice(0, limit).map(toUser);
				const last = items.at(-1);

				return {
					items,
					nextCursor:
						found.length > limit && last !== undefined ? last.id : null,
				};
			}),

		updateUser: (id, patch, ifVersion) =>
			run$('updateUser', () => updateUser(collection, id, patch, ifVersion)),

		deleteUser: (id) =>
			run$('deleteUser', async () => {
				const result = await collection.raw.deleteOne({ _id: id });
				return result.deletedCount === 1;
			}),
	};
}

async function findUser(
	collection: Users,
	id: string,
): Promise<UserRecord | null> {
	const found = await collection.findById(id);
	return found === undefined ? null : toUser(found);
}

async function insertUser(
	collection: Users,
	record: UserRecord,
): Promise<UserRecord> {
	const document = toUserDocument(record);
	const outcome = await settle(collection.raw.insertOne(document));
	if (!('duplicate' in outcome)) return toUser(document);

	// A retry whose first attempt landed: whichever index reported it,
	// the user with this id is there, and is the answer. That includes
	// their own logins, which are not taken by them.
	const stored = await findUser(collection, record.id);
	if (stored !== null) return stored;
	throw refuseDuplicate('insertUser', outcome.duplicate);
}

async function updateUser(
	collection: Users,
	id: string,
	patch: UserPatch,
	ifVersion: number,
): Promise<UserRecord> {
	const outcome = await settle(
		collection.raw.findOneAndUpdate(
			{ _id: id, version: ifVersion },
			{ $set: toUserSet(patch), $inc: { version: 1 } },
			{ returnDocument: 'after' },
		),
	);

	if ('duplicate' in outcome) {
		throw refuseDuplicate('updateUser', outcome.duplicate);
	}
	if (outcome.written !== null) return toUser(outcome.written);

	// The write matched nothing, which alone cannot tell an unknown id
	// from a moved version: read again, and say which.
	const stored = await findUser(collection, id);
	if (stored === null) {
		throw new NotFoundError('updateUser: no user has this id', {
			userId: id,
			operation: 'updateUser',
		});
	}
	throw new StoreConflict(
		'version',
		`updateUser: expected version ${ifVersion}, found ${stored.version}`,
		{
			userId: id,
			expectedVersion: ifVersion,
			actualVersion: stored.version,
			operation: 'updateUser',
		},
	);
}
