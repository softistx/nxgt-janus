/**
 * What the store port refuses at COMPILE time, seen from the side of
 * the person implementing it.
 *
 * Checked by `tsc --noEmit`, never run — see `../refusals.ts` for why a
 * `@ts-expect-error` is the unit of measurement. The cases in this folder are
 * the mistakes a stranger writing an adapter is likely to make, and each one
 * would otherwise surface as a conformance failure at best, and at worst as
 * an outage reported as "no such account".
 *
 * **Twenty-two plausible mistakes, twenty-two refused**, numbered across the
 * folder, one file per behaviour: `stores.ts` (the stores and their answers),
 * `calls.ts` (what a call must say), `patches.ts` and `records.ts` — each
 * beside the shapes that must keep compiling. Add a case whenever the port
 * gains something it should refuse; never delete one to make a change pass.
 *
 * This file holds no case: only the values the others are written against.
 */

import type {
	SessionStore,
	TokenRecord,
	TokenStore,
	UserRecord,
	UserStore,
} from '../../../src/auth/port/types';

export declare const record: UserRecord;
export declare const users: UserStore;
export declare const sessions: SessionStore;
export declare const tokens: TokenStore;
export declare const token: TokenRecord;
export const now = new Date();
