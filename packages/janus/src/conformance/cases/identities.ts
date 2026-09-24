import { NotFoundError, StoreConflict } from '../../errors/janus-error';
import type { IdentityRecord } from '../../identities/port/types';
import { mintIdentityId } from '../../ids/identity-id';
import { equal, isNull, isOurs, ok, rejects } from '../assert';
import { at, identityRecord } from '../fixtures';
import type { ConformanceCase } from '../types';

const group = 'identities';

export const identityStoreCases: readonly ConformanceCase[] = [
	{
		id: 'identities.roundTrip',
		group,
		name: 'round-trips a record byte for byte: nested traits, a 1 that stays a number, a "1" that stays a string',
		async run({ stores }) {
			const record = identityRecord({
				traits: {
					email: 'Ada@Example.test',
					name: { first: 'Ada', last: 'Lovelace' },
					count: 1,
					code: '1',
					flags: [true, false, null],
					note: '  spaced  ',
					unicode: 'Ｂob — ÿ',
					nested: { deep: { deeper: [1, { two: 2 }] } },
				},
				metadataPublic: { theme: 'dark', zero: 0 },
				metadataAdmin: { plan: 'pro', tags: ['a', 'b'] },
			});

			equal(
				await stores.identities.insertIdentity(record),
				record,
				'insertIdentity should answer the record as stored',
			);
			equal(
				await stores.identities.findIdentity(record.id),
				record,
				'findIdentity should answer the record exactly as it was written',
			);
		},
	},
	{
		id: 'identities.absence',
		group,
		name: 'answers null for an absence, never undefined, and an empty page for an empty store',
		async run({ stores }) {
			isNull(
				await stores.identities.findIdentity(mintIdentityId()),
				'findIdentity for an unknown id',
			);
			isNull(
				await stores.identities.findIdentityByIdentifier(
					'password',
					'nobody@example.test',
				),
				'findIdentityByIdentifier for an unknown identifier',
			);
			equal(
				await stores.identities.listIdentities({ after: null, limit: 10 }),
				{ items: [], nextCursor: null },
				'listIdentities on an empty store should answer an empty page',
			);
		},
	},
	{
		id: 'identities.identifierBytes',
		group,
		name: 'compares identifiers as bytes: no case folding, no trimming, no collation',
		async run({ stores }) {
			const upper = identityRecord({
				identifiers: [{ type: 'password', value: 'Ada@Example.test' }],
			});
			const lower = identityRecord({
				identifiers: [{ type: 'password', value: 'ada@example.test' }],
			});
			const code = identityRecord({
				identifiers: [{ type: 'code', value: 'ada@example.test' }],
			});

			for (const record of [upper, lower, code]) {
				await stores.identities.insertIdentity(record);
			}

			equal(
				(
					await stores.identities.findIdentityByIdentifier(
						'password',
						'Ada@Example.test',
					)
				)?.id,
				upper.id,
				'findIdentityByIdentifier should find the identifier with its exact bytes',
			);
			equal(
				(
					await stores.identities.findIdentityByIdentifier(
						'password',
						'ada@example.test',
					)
				)?.id,
				lower.id,
				'findIdentityByIdentifier should tell "Ada@…" from "ada@…": normalisation is the core’s',
			);
			equal(
				(
					await stores.identities.findIdentityByIdentifier(
						'code',
						'ada@example.test',
					)
				)?.id,
				code.id,
				'uniqueness is of (type, value): the same value under another type is another identifier',
			);
		},
	},
	{
		id: 'identities.idempotentInsert',
		group,
		name: 'is idempotent under retry: inserting an existing id answers the stored record and writes nothing',
		async run({ stores }) {
			const record = identityRecord();
			await stores.identities.insertIdentity(record);

			const retried = await stores.identities.insertIdentity({
				...record,
				traits: { email: 'changed@example.test' },
			});

			equal(
				retried,
				record,
				'insertIdentity retried with the same id should answer the stored record',
			);
			equal(
				await stores.identities.findIdentity(record.id),
				record,
				'insertIdentity retried should write nothing',
			);
		},
	},
	{
		id: 'identities.uniqueness',
		group,
		name: 'lets exactly one of twenty concurrent inserts hold an identifier: uniqueness is a constraint, not a read',
		async run({ stores }) {
			const shared = [
				{ type: 'password' as const, value: 'contested@example.test' },
			];
			const records = Array.from({ length: 20 }, () =>
				identityRecord({ identifiers: shared }),
			);

			const outcomes = await Promise.allSettled(
				records.map((record) => stores.identities.insertIdentity(record)),
			);
			const accepted = outcomes.filter((o) => o.status === 'fulfilled');
			const refused = outcomes.flatMap((o) =>
				o.status === 'rejected' ? [o.reason as unknown] : [],
			);

			equal(
				accepted.length,
				1,
				'insertIdentity: of twenty concurrent inserts of one identifier, exactly one should be accepted — a read followed by a write lets several through',
			);
			for (const error of refused) {
				isOurs(
					error,
					StoreConflict,
					'insertIdentity should refuse a taken identifier with StoreConflict',
				);
				equal(
					error.code,
					'IDENTIFIER_TAKEN',
					'insertIdentity: the conflict code',
				);
				equal(
					error.identifier,
					'contested@example.test',
					'insertIdentity: the conflict should name the identifier',
				);
			}
			let stored = 0;
			for (const record of records) {
				if ((await stores.identities.findIdentity(record.id)) !== null)
					stored += 1;
			}
			equal(stored, 1, 'insertIdentity: a refused insert should write nothing');
		},
	},
	{
		id: 'identities.versionIncrements',
		group,
		name: 'applies an update at the expected version, and answers the record written with its version one higher',
		async run({ stores }) {
			const record = identityRecord();
			await stores.identities.insertIdentity(record);

			const written = await stores.identities.updateIdentity(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), state: 'inactive' },
				0,
			);
			const expected: IdentityRecord = {
				...record,
				state: 'inactive',
				version: 1,
				updatedAt: at('2026-02-01T00:00:00.000Z'),
			};

			equal(
				written,
				expected,
				'updateIdentity should answer the record as written',
			);
			equal(
				await stores.identities.findIdentity(record.id),
				expected,
				'findIdentity after updateIdentity',
			);
		},
	},
	{
		id: 'identities.versionConflict',
		group,
		name: 'refuses a stale version with both versions, and leaves the record identical byte for byte',
		async run({ stores }) {
			const record = identityRecord();
			await stores.identities.insertIdentity(record);
			await stores.identities.updateIdentity(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), state: 'inactive' },
				0,
			);
			const before = await stores.identities.findIdentity(record.id);

			const error = await rejects(
				stores.identities.updateIdentity(
					record.id,
					{
						updatedAt: at('2026-03-01T00:00:00.000Z'),
						state: 'active',
						traits: { email: 'overwritten@example.test' },
					},
					0,
				),
				'updateIdentity at a stale version should reject',
			);

			isOurs(
				error,
				StoreConflict,
				'updateIdentity at a stale version should reject with StoreConflict',
			);
			equal(
				error.code,
				'VERSION_CONFLICT',
				'updateIdentity: the conflict code',
			);
			equal(error.expectedVersion, 0, 'updateIdentity: expectedVersion');
			equal(error.actualVersion, 1, 'updateIdentity: actualVersion');
			// A partial write that also reports a conflict is the worst of both.
			equal(
				await stores.identities.findIdentity(record.id),
				before,
				'updateIdentity refused for its version should have written nothing',
			);
		},
	},
	{
		id: 'identities.unknownUpdate',
		group,
		name: 'refuses an update to an unknown id with NotFoundError, told apart from a version conflict',
		async run({ stores }) {
			const error = await rejects(
				stores.identities.updateIdentity(
					mintIdentityId(),
					{ updatedAt: at('2026-02-01T00:00:00.000Z') },
					0,
				),
				'updateIdentity on an unknown id should reject',
			);

			isOurs(
				error,
				NotFoundError,
				'updateIdentity on an unknown id should reject with NotFoundError, not a version conflict',
			);
		},
	},
	{
		id: 'identities.omission',
		group,
		name: 'omission — the Kratos PUT trap: an update leaves every field it does not name exactly as it was',
		async run({ stores }) {
			const record = identityRecord({
				state: 'active',
				metadataAdmin: { plan: 'pro' },
				addresses: [
					{
						value: 'kept@example.test',
						via: 'email',
						verified: true,
						verifiedAt: at('2026-01-02T00:00:00.000Z'),
					},
				],
			});
			await stores.identities.insertIdentity(record);

			const written = await stores.identities.updateIdentity(
				record.id,
				{
					updatedAt: at('2026-02-01T00:00:00.000Z'),
					metadataPublic: { theme: 'dark' },
				},
				0,
			);

			equal(
				written,
				{
					...record,
					metadataPublic: { theme: 'dark' },
					version: 1,
					updatedAt: at('2026-02-01T00:00:00.000Z'),
				},
				'updateIdentity naming only metadataPublic should leave state, traits, identifiers, credentials, addresses and metadataAdmin untouched',
			);
		},
	},
	{
		id: 'identities.credentialSlots',
		group,
		name: 'patches credentials slot by slot: a password not named is kept, a password named null is removed',
		async run({ stores }) {
			const record = identityRecord();
			await stores.identities.insertIdentity(record);

			const kept = await stores.identities.updateIdentity(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), credentials: {} },
				0,
			);
			equal(
				kept.credentials,
				record.credentials,
				'updateIdentity with credentials: {} should keep the password',
			);

			const removed = await stores.identities.updateIdentity(
				record.id,
				{
					updatedAt: at('2026-02-02T00:00:00.000Z'),
					credentials: { password: null },
				},
				1,
			);
			isNull(
				removed.credentials.password,
				'updateIdentity with credentials: { password: null } should remove the password',
			);
		},
	},
	{
		id: 'identities.identifiersMove',
		group,
		name: 'moves identifiers on update: the old one is free, the new one found, one held elsewhere refused',
		async run({ stores }) {
			const record = identityRecord();
			const other = identityRecord();
			await stores.identities.insertIdentity(record);
			await stores.identities.insertIdentity(other);
			const [old] = record.identifiers;
			const moved = { type: 'password' as const, value: 'moved@example.test' };

			await stores.identities.updateIdentity(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), identifiers: [moved] },
				0,
			);

			isNull(
				await stores.identities.findIdentityByIdentifier(
					'password',
					old?.value ?? '',
				),
				'findIdentityByIdentifier for an identifier the update replaced',
			);
			equal(
				(
					await stores.identities.findIdentityByIdentifier(
						'password',
						moved.value,
					)
				)?.id,
				record.id,
				'findIdentityByIdentifier for the identifier the update wrote',
			);

			const error = await rejects(
				stores.identities.updateIdentity(
					other.id,
					{ updatedAt: at('2026-02-02T00:00:00.000Z'), identifiers: [moved] },
					0,
				),
				'updateIdentity onto an identifier another identity holds should reject',
			);
			isOurs(
				error,
				StoreConflict,
				'updateIdentity onto a held identifier should reject with StoreConflict',
			);
			equal(
				error.code,
				'IDENTIFIER_TAKEN',
				'updateIdentity: the conflict code',
			);
			equal(
				await stores.identities.findIdentity(other.id),
				other,
				'updateIdentity refused for an identifier should have written nothing',
			);
		},
	},
	{
		id: 'identities.pagination',
		group,
		name: 'pages 25 records by 10 in ascending id order, with no gap and no repeat, and ends on a null cursor',
		async run({ stores }) {
			const records = Array.from({ length: 25 }, () => identityRecord());
			// Written newest first, so insertion order is not the answer.
			for (const record of [...records].reverse()) {
				await stores.identities.insertIdentity(record);
			}
			const expected = records.map((record) => record.id).sort();

			const seen: string[] = [];
			const sizes: number[] = [];
			let after: string | null = null;
			for (let page = 0; page < 10; page += 1) {
				const answer = await stores.identities.listIdentities({
					after,
					limit: 10,
				});
				seen.push(...answer.items.map((item) => item.id));
				sizes.push(answer.items.length);
				after = answer.nextCursor;
				if (after === null) break;
			}

			equal(
				sizes,
				[10, 10, 5],
				'listIdentities: page sizes for 25 records by 10',
			);
			equal(
				seen,
				expected,
				'listIdentities: every id once, in ascending order',
			);

			// The cursor need not name a stored identity.
			const between = await stores.identities.listIdentities({
				after: '00000000-0000-7000-8000-000000000000',
				limit: 3,
			});
			ok(
				between.items[0]?.id === expected[0],
				'listIdentities: a cursor naming no stored identity should start after it, not fail',
			);
		},
	},
];
