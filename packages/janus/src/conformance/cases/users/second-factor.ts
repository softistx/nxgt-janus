import type { JanusStores, SecondFactorRecord } from '../../../auth/port/types';
import type { Id } from '../../../ids/id';
import { equal, isNull, ok } from '../../assert';
import { at, userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

/** A second factor as the core writes it: the secret sealed, opaque to a store. */
export const secondFactor: SecondFactorRecord = {
	method: 'totp',
	secret: 'v1.2026-09.aXY.Y2lwaGVydGV4dA',
	confirmedAt: null,
	lastStep: null,
	recoveryCodes: [],
};

/**
 * Recovery codes as the core writes them: keyed hashes, opaque to a store,
 * and deliberately **not** in sorted order, so a store that sorts is caught.
 */
export const recoveryCodes: readonly string[] = [
	'v1.2026-09.zHc0dGhpcmQ',
	'v1.2026-09.Yg2ZpcnN0',
	'v1.2026-09.mc2Vjb25k',
];

/**
 * A second factor round-trips whole — its recovery codes in order, `[]` as
 * `[]` — a patch that does not name it keeps it, one that names it replaces
 * it, codes included, and `null` removes it, codes included.
 */
export const secondFactorSlotCase: ConformanceCase = {
	id: 'users.secondFactorSlot',
	group: 'users',
	name: 'round-trips a second factor and its recovery codes in order, keeps it when a patch does not name it, replaces it whole when one does, and removes it, codes included, when the patch names null',
	async run({ stores }) {
		const record = userRecord({ secondFactor });
		equal(
			await stores.users.insertUser(record),
			record,
			'insertUser should answer a pending second factor as written: confirmedAt and lastStep null, recoveryCodes []',
		);
		await noCodesIsNotNoFactor(stores, record.id);

		const confirmed: SecondFactorRecord = {
			...secondFactor,
			confirmedAt: at('2026-02-01T00:00:00.000Z'),
			lastStep: 59_000_000,
			recoveryCodes,
		};
		await patchFactor(stores, record.id, confirmed, 0, 'secondFactor');
		equal(
			(await stores.users.updateUser(record.id, { updatedAt: writtenAt(1) }, 1))
				.secondFactor,
			confirmed,
			'updateUser not naming secondFactor should keep it, recovery codes included',
		);

		await replacesCodesWhole(stores, record.id, confirmed);
		await nullClearsCodes(stores, record.id);
	},
};

/** The `updatedAt` of the write under `version`: one day later per version. */
const writtenAt = (version: number): Date =>
	new Date(Date.UTC(2026, 1, 2 + version));

/** `[]` is a factor with no codes: never `null`, never a missing field. */
async function noCodesIsNotNoFactor(stores: JanusStores, id: Id) {
	const user = await stores.users.findUser(id);
	ok(user !== null, 'findUser should answer the user insertUser wrote');
	const found = user?.secondFactor;
	ok(
		found !== null && found !== undefined,
		'findUser should answer a second factor with recoveryCodes [] as a factor, not as null — no codes is not no factor',
	);
	equal(
		found?.recoveryCodes,
		[],
		'findUser should answer recoveryCodes [] as [] — never null, never undefined',
	);
}

/** Writes `factor` under `version`, and checks both answers: the write's and a read's. */
async function patchFactor(
	stores: JanusStores,
	id: Id,
	factor: SecondFactorRecord,
	version: number,
	what: string,
) {
	const written = await stores.users.updateUser(
		id,
		{
			updatedAt: writtenAt(version),
			secondFactor: factor,
		},
		version,
	);
	equal(
		written.secondFactor,
		factor,
		`updateUser naming ${what} should replace the second factor whole, its recovery codes in the order written`,
	);
	equal(
		(await stores.users.findUser(id))?.secondFactor,
		factor,
		`findUser after updateUser naming ${what} should answer it as written, its recovery codes in the order written`,
	);
}

/** A patch's codes replace the stored ones: never appended, never merged. */
async function replacesCodesWhole(
	stores: JanusStores,
	id: Id,
	confirmed: SecondFactorRecord,
) {
	const kept = recoveryCodes.filter((_, index) => index !== 1);
	await patchFactor(
		stores,
		id,
		{ ...confirmed, recoveryCodes: kept },
		2,
		'secondFactor with one recovery code fewer',
	);
	await patchFactor(
		stores,
		id,
		{ ...confirmed, recoveryCodes: [] },
		3,
		'secondFactor with recoveryCodes []',
	);
}

/** `secondFactor: null` removes the codes with the factor: a new factor starts with none. */
async function nullClearsCodes(stores: JanusStores, id: Id) {
	await patchFactor(
		stores,
		id,
		{ ...secondFactor, recoveryCodes },
		4,
		'secondFactor with recovery codes',
	);
	isNull(
		(
			await stores.users.updateUser(
				id,
				{ updatedAt: writtenAt(5), secondFactor: null },
				5,
			)
		).secondFactor,
		'updateUser with secondFactor: null should remove the second factor',
	);
	isNull(
		(await stores.users.findUser(id))?.secondFactor,
		'findUser after updateUser with secondFactor: null should answer no second factor',
	);
	await patchFactor(
		stores,
		id,
		secondFactor,
		6,
		'a new secondFactor after null, with recoveryCodes [] — the removed codes must not come back',
	);
}
