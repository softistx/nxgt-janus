import { describe, expect, it } from 'bun:test';
import { assertStores } from './assert-stores';
import { createMemoryStores } from './memory';

describe('assertStores', () => {
	it('accepts a complete set of stores, and reports the optional capability', () => {
		expect(assertStores(createMemoryStores(), 'createIdentities')).toEqual({
			collectExpired: true,
		});
	});

	it('reports a store without the optional method as not collecting, not as broken', () => {
		const stores = createMemoryStores();
		const { deleteExpiredSessions: _, ...sessions } = stores.sessions;

		expect(assertStores({ ...stores, sessions }, 'createIdentities')).toEqual({
			collectExpired: false,
		});
	});

	it('names the call, the slot and the method, so the sentence says what to fix', () => {
		const stores = createMemoryStores();
		const { consumeToken: _, ...tokens } = stores.tokens;

		expect(() =>
			assertStores({ ...stores, tokens }, 'createIdentities'),
		).toThrow(
			new TypeError(
				'createIdentities: stores.tokens has no method consumeToken, which the port requires',
			),
		);
	});

	it('refuses a missing slot with a bare TypeError: only wiring produces one', () => {
		const { sessions: _, ...stores } = createMemoryStores();

		expect(() => assertStores(stores, 'createIdentities')).toThrow(TypeError);
		expect(() => assertStores(stores, 'createIdentities')).toThrow(
			'createIdentities: stores.sessions is missing',
		);
		expect(() => assertStores(null, 'createIdentities')).toThrow(TypeError);
	});

	it('refuses an optional method that is present but not a function', () => {
		// Reporting it as "unsupported" later would send the reader to the wrong
		// fix: the capability is not absent, it is miswired.
		const stores = createMemoryStores();

		expect(() =>
			assertStores(
				{
					...stores,
					sessions: { ...stores.sessions, deleteExpiredSessions: true },
				},
				'createIdentities',
			),
		).toThrow(
			'createIdentities: stores.sessions.deleteExpiredSessions must be a function or absent',
		);
	});
});
