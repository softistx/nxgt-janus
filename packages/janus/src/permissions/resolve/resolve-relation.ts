/** One relation of an object type: its holders, or the field `fromField` reads. */

import type { Holder, ResolvedRelation } from './resolved';
import { isRecord, type Refuse } from './step';

/** A field `fromField` reads: a top-level property. */
const FIELD = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function resolveRelation(
	value: unknown,
	here: string,
	{
		refuse,
		isSubjectType,
		relationNames,
	}: {
		refuse: Refuse;
		isSubjectType: (type: string) => boolean;
		relationNames: ReadonlyMap<string, ReadonlySet<string>>;
	},
): ResolvedRelation {
	if (isRecord(value) && value.kind === 'fromField') {
		const { field, subject, lookup } = value;
		if (typeof field !== 'string' || !FIELD.test(field)) {
			throw refuse(`${here}: fromField must name a top-level field`);
		}
		if (typeof subject !== 'string' || !isSubjectType(subject)) {
			throw refuse(
				`${here}: fromField names "${String(subject)}", which is not a subject type`,
			);
		}
		if (lookup !== undefined && typeof lookup !== 'function') {
			throw refuse(`${here}: fromField's lookup must be a function`);
		}
		return lookup === undefined
			? { kind: 'fromField', field, subject }
			: {
					kind: 'fromField',
					field,
					subject,
					lookup: lookup as (subjectId: string) => Promise<readonly string[]>,
				};
	}

	if (!Array.isArray(value) || value.length === 0) {
		throw refuse(
			`${here} must be a non-empty array of subject types, or fromField()`,
		);
	}
	const holders = value.map((holder: unknown): Holder => {
		if (typeof holder !== 'string') {
			throw refuse(`${here}: a holder must be a string`);
		}
		const hash = holder.indexOf('#');
		if (hash < 0) {
			if (!isSubjectType(holder)) {
				throw refuse(`${here}: "${holder}" is not a subject type`);
			}
			return { kind: 'type', type: holder };
		}
		const type = holder.slice(0, hash);
		const relation = holder.slice(hash + 1);
		if (!relationNames.get(type)?.has(relation)) {
			throw refuse(
				`${here}: "${holder}" is not a subject set — it must name an object type and one of its relations`,
			);
		}
		return { kind: 'set', type, relation };
	});
	return { kind: 'stored', holders };
}
