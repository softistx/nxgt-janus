import {
	createMemoryRelations,
	defineModel,
	permissions,
} from '@nxgt/janus/permissions';
import { instrumentPermissions } from './permissions';

export function setup() {
	const relations = createMemoryRelations();
	const outage = { on: false };
	const has = relations.has.bind(relations);
	const access = instrumentPermissions(
		permissions({
			model: defineModel({
				subjects: ['staff'],
				types: {
					record: {
						related: { owners: ['staff'] },
						permits: { view: ['owners'] },
					},
				},
			}),
			store: {
				...relations,
				has: (tuple) => {
					if (outage.on) throw new Error('connection refused');
					return has(tuple);
				},
			},
		}),
	);
	return { access, outage };
}

export const ada = { type: 'staff', id: 'u1' } as const;
export const record = { type: 'record', id: 'r1' } as const;
