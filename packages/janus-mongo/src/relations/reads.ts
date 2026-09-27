import {
	type CursorPage,
	type Entity,
	isSubjectSet,
	type RelationTuple,
	type SubjectSet,
} from '@nxgt/janus';
import type { ObjectPageRequest } from '@nxgt/janus/permissions';
import type { Filter } from 'mongodb';
import type { RelationDocument } from './collection';
import type { RelationContext } from './context';
import { keyOf } from './tuples';

export async function has(
	{ collection }: RelationContext,
	tuple: RelationTuple,
): Promise<boolean> {
	return (
		(await collection.findOne(
			{ _id: keyOf(tuple) },
			{ projection: { _id: 1 } },
		)) !== null
	);
}

export async function findSubjectSets(
	context: RelationContext,
	object: Entity,
	relation: string,
): Promise<SubjectSet[]> {
	return (await holding(context, object, relation, true)).map(
		(subject): SubjectSet => ({
			type: subject.type,
			id: subject.id,
			relation: subject.relation as string,
		}),
	);
}

export async function findEntities(
	context: RelationContext,
	object: Entity,
	relation: string,
): Promise<Entity[]> {
	return (await holding(context, object, relation, false)).map(
		(subject): Entity => ({ type: subject.type, id: subject.id }),
	);
}

/** One hop from an object: its subject sets, or its entities. */
async function holding(
	{ collection }: RelationContext,
	object: Entity,
	relation: string,
	sets: boolean,
) {
	return (
		await collection
			.find({
				'_id.object.type': object.type,
				'_id.object.id': object.id,
				'_id.relation': relation,
				'_id.subject.relation': { $exists: sets },
			})
			.toArray()
	).map((document) => document._id.subject);
}

/** A page of object ids, in id order, after the cursor. */
export async function findObjects(
	{ collection }: RelationContext,
	{ type, relation, subject, after, limit }: ObjectPageRequest,
): Promise<CursorPage<string>> {
	const filter: Filter<RelationDocument> = {
		'_id.subject.type': subject.type,
		'_id.subject.id': subject.id,
		// `null` matches the missing field: an entity, not a set.
		'_id.subject.relation': isSubjectSet(subject) ? subject.relation : null,
		'_id.relation': relation,
		'_id.object.type': type,
		...(after === null ? {} : { '_id.object.id': { $gt: after } }),
	};
	const found = await collection
		.find(filter, { projection: { '_id.object.id': 1 } })
		.sort({ '_id.object.id': 1 })
		.limit(limit + 1)
		.toArray();
	const items = found.slice(0, limit).map((document) => document._id.object.id);
	const last = items.at(-1);
	return {
		items,
		nextCursor: found.length > limit && last !== undefined ? last : null,
	};
}
