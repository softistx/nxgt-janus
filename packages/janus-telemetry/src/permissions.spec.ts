import { describe, expect, it } from 'bun:test';
import { setOf } from '@nxgt/janus';
import {
	createMemoryRelations,
	defineModel,
	permissions,
} from '@nxgt/janus/permissions';
import { collect, rejection } from '../test/collect';
import { instrumentPermissions } from './permissions';

function setup() {
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

const ada = { type: 'staff', id: 'u1' } as const;
const record = { type: 'record', id: 'r1' } as const;

describe('instrumentPermissions()', () => {
	it('traces can() with its question and its answer, a denial ok', async () => {
		const { access } = setup();
		const { spans } = await collect(async () => {
			await access.can(ada, 'view', record);
		});

		const can = spans.find((span) => span.name === 'janus.can');
		expect(can?.status).toBe('ok');
		expect(can?.attributes).toMatchObject({
			'janus.subject.type': 'staff',
			'janus.subject.id': 'u1',
			'janus.permission': 'view',
			'janus.object.type': 'record',
			'janus.object.id': 'r1',
			'janus.allowed': false,
		});
	});

	it('writes an audit event per tuple granted or revoked', async () => {
		const { access } = setup();
		const { logs, spans } = await collect(async () => {
			await access.grant(record, 'owners', ada);
			expect(await access.can(ada, 'view', record)).toBe(true);
			await access.revoke(record, 'owners', ada);
		});

		const audit = logs
			.filter((log) => log.name.startsWith('janus.tuple.'))
			.map((log) => [log.name, log.attributes]);
		const tuple = {
			'janus.object.type': 'record',
			'janus.object.id': 'r1',
			'janus.relation': 'owners',
			'janus.subject.type': 'staff',
			'janus.subject.id': 'u1',
		};
		expect(audit).toEqual([
			['janus.tuple.granted', expect.objectContaining(tuple)],
			['janus.tuple.revoked', expect.objectContaining(tuple)],
		]);
		expect(
			spans.find((span) => span.name === 'janus.can')?.attributes[
				'janus.allowed'
			],
		).toBe(true);
	});

	it('records a subject as permissions() reads it: a set only when it is one', async () => {
		const access = instrumentPermissions(
			permissions({
				model: defineModel({
					subjects: ['staff'],
					types: {
						staff: { related: { managers: ['staff'] } },
						note: { related: { readers: ['staff', 'staff#managers'] } },
					},
				}),
				store: createMemoryRelations(),
			}),
		);
		const note = { type: 'note', id: 'n1' } as const;
		const withRelation = { ...ada, relation: 'managers' };
		const { logs } = await collect(async () => {
			await access.grant(note, 'readers', withRelation);
			await access.grant(note, 'readers', setOf(ada, 'managers'));
		});

		const subjects = logs
			.filter((log) => log.name === 'janus.tuple.granted')
			.map((log) => log.attributes['janus.subject.relation']);
		expect(subjects).toEqual([undefined, 'managers']);
	});

	it('counts what list() found', async () => {
		const { access } = setup();
		await access.grant(record, 'owners', ada);
		const { spans } = await collect(async () => {
			await access.list(ada, 'view', 'record');
		});
		expect(
			spans.find((span) => span.name === 'janus.list')?.attributes,
		).toMatchObject({
			'janus.permission': 'view',
			'janus.object.type': 'record',
			'janus.page.items': 1,
		});
	});

	it('fails the span when the relation store cannot answer, never a denial', async () => {
		const { access, outage } = setup();
		outage.on = true;
		let failure: unknown;
		const { spans } = await collect(async () => {
			failure = await rejection(access.can(ada, 'view', record));
		});

		expect(failure).toMatchObject({ code: 'STORE_FAILED' });
		const can = spans.find((span) => span.name === 'janus.can');
		expect(can?.status).toBe('error');
		expect(can?.attributes).toMatchObject({ 'janus.store.slot': 'relations' });
		expect(can?.attributes['janus.allowed']).toBeUndefined();
	});
});
