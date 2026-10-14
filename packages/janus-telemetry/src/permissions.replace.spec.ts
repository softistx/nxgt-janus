import { describe, expect, it } from 'bun:test';
import {
	createMemoryRelations,
	defineModel,
	permissions,
} from '@nxgt/janus/permissions';
import { collect, rejection } from '../test/collect';
import { instrumentPermissions } from './permissions';
import { ada, record, setup } from './permissions.fixtures';

describe('instrumentPermissions()', () => {
	it('traces replace() as a span, and an audit event per tuple added or removed', async () => {
		const { access } = setup();
		const bob = { type: 'staff', id: 'u2' } as const;
		await access.grant(record, 'owners', ada);
		const { logs, spans } = await collect(async () => {
			await access.replace(record, 'owners', [bob]);
		});

		const replaced = spans.find((span) => span.name === 'janus.replace');
		expect(replaced?.status).toBe('ok');
		expect(replaced?.attributes).toMatchObject({
			'janus.object.type': 'record',
			'janus.object.id': 'r1',
			'janus.relation': 'owners',
		});
		const tuple = (id: string) => ({
			'janus.object.type': 'record',
			'janus.object.id': 'r1',
			'janus.relation': 'owners',
			'janus.subject.type': 'staff',
			'janus.subject.id': id,
		});
		expect(
			logs
				.filter((log) => log.name.startsWith('janus.tuple.'))
				.map((log) => [log.name, log.attributes]),
		).toEqual([
			['janus.tuple.granted', expect.objectContaining(tuple('u2'))],
			['janus.tuple.revoked', expect.objectContaining(tuple('u1'))],
		]);
	});

	it('writes no audit event for a replace that changes nothing, or fails', async () => {
		const { access } = setup();
		await access.grant(record, 'owners', ada);
		const { logs } = await collect(async () => {
			await access.replace(record, 'owners', [ada]);
			await rejection(access.replace(record, 'owners', 'ada' as never));
		});

		expect(logs.filter((log) => log.name.startsWith('janus.tuple.'))).toEqual(
			[],
		);
	});

	it('records a replaced subject set with its relation', async () => {
		const access = instrumentPermissions(
			permissions({
				model: defineModel({
					subjects: ['staff'],
					types: {
						team: { related: { members: ['staff'] }, permits: {} },
						note: {
							related: { readers: ['staff', 'team#members'] },
							permits: { read: ['readers'] },
						},
					},
				}),
				store: createMemoryRelations(),
			}),
		);
		const { logs } = await collect(async () => {
			await access.replace({ type: 'note', id: 'n1' }, 'readers', [
				{ type: 'team', id: 't1', relation: 'members' },
			]);
		});

		expect(
			logs.find((log) => log.name === 'janus.tuple.granted')?.attributes,
		).toMatchObject({
			'janus.subject.type': 'team',
			'janus.subject.id': 't1',
			'janus.subject.relation': 'members',
		});
	});
});
