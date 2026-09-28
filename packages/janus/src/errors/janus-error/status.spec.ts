import { describe, expect, it } from 'bun:test';
import type { JanusErrorCode } from './codes';
import { type JanusErrorStatus, statusOf } from './status';

/** The whole table, written out once: a change to it is a change to this list. */
const table = [
	['STORE_FAILED', 503],
	['NOT_FOUND', 404],
	['LOGIN_TAKEN', 409],
	['VERSION_CONFLICT', 409],
	['USER_INVALID', 400],
	['PASSWORD_TOO_SHORT', 400],
	['CREDENTIALS_INVALID', 401],
	['HASH_UNSUPPORTED', 400],
	['USER_INACTIVE', 403],
	['TOKEN_UNKNOWN', 400],
	['TOKEN_SPENT', 400],
	['TOKEN_EXPIRED', 400],
	['TOKEN_STALE', 400],
	['CODE_INVALID', 401],
	['SECOND_FACTOR_NOT_ENROLLED', 409],
	['SECOND_FACTOR_ACTIVE', 409],
	['INVALID_CURSOR', 400],
	['UNSUPPORTED', 501],
	['PERMISSION_DEPTH', 500],
] as const satisfies readonly (readonly [JanusErrorCode, JanusErrorStatus])[];

/** Fails the typecheck when a code is missing from the table. */
const exhaustive: [Exclude<JanusErrorCode, (typeof table)[number][0]>] extends [
	never,
]
	? true
	: false = true;

describe('statusOf()', () => {
	it('answers every code the status of the table', () => {
		expect(exhaustive).toBe(true);
		for (const [code, status] of table) {
			expect([code, statusOf(code)]).toEqual([code, status]);
		}
	});

	it('answers 503 to STORE_FAILED alone — an outage is not a negative answer', () => {
		const codes = table.map(([code]) => code);
		expect(codes.filter((code) => statusOf(code) === 503)).toEqual([
			'STORE_FAILED',
		]);
	});
});
