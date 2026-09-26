import { describe, expect, it } from 'bun:test';
import { createMemoryStores } from '../auth/port/memory';
import {
	allCases,
	describeJanusStores,
	runCase,
	SKIP_REASONS,
} from './describe';
import { referenceHarness } from './reference';
import type { ConformanceRunner } from './types';

// The suite proved before any adapter exists: every case, outages included,
// against the reference store — no binary, no server.
describeJanusStores({
	name: 'the reference store',
	harness: referenceHarness(),
	runner: { describe, it },
});

describe('the suite itself', () => {
	it('covers the thirteen methods whose honest answer can be nothing', () => {
		expect(
			allCases.filter((c) => c.group === 'outage').map((c) => c.id),
		).toEqual([
			'outage.findUser',
			'outage.findUserByLogin',
			'outage.listUsers',
			'outage.findSessionByTokenHash',
			'outage.extendSession',
			'outage.revokeSession',
			'outage.revokeUserSessions',
			'outage.consumeToken',
			'outage.countAttempt',
			'outage.spendUserTokens',
			'outage.deleteUser',
			'outage.deleteUserSessions',
			'outage.deleteUserTokens',
		]);
	});

	it('gives every case a unique id', () => {
		const ids = allCases.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('reports a run without faults, never passes over it', async () => {
		const withoutFaults = {
			open: async () => ({ stores: createMemoryStores() }),
		};
		const outage = allCases.find((c) => c.id === 'outage.findUser');
		if (outage === undefined) throw new Error('no outage case');

		expect(await runCase(outage, withoutFaults)).toEqual({
			skipped: SKIP_REASONS.faults,
		});
	});

	it('names the skip in the test name, and says WITHOUT faults above the suite', () => {
		const names: string[] = [];
		const skipped: string[] = [];
		const recording: ConformanceRunner = {
			describe: (name, body) => {
				names.push(name);
				body();
			},
			it: Object.assign((name: string) => names.push(name), {
				skip: (name: string) => skipped.push(name),
			}),
		};

		describeJanusStores({
			name: 'an adapter',
			harness: referenceHarness(),
			runner: recording,
			faults: false,
			skip: { 'users.pagination': 'our database pages by timestamp' },
		});

		expect(names[0]).toContain('WITHOUT faults');
		expect(skipped).toHaveLength(14);
		expect(skipped.filter((n) => n.includes(SKIP_REASONS.faults))).toHaveLength(
			13,
		);
		expect(skipped).toContainEqual(
			expect.stringContaining('skipped: our database pages by timestamp'),
		);
	});

	it('refuses to guess a runner under bun test, and says how to pass one', () => {
		// Measured: bun test gives a file describe and it as bare identifiers,
		// not on globalThis.
		expect(() =>
			describeJanusStores({ name: 'x', harness: referenceHarness() }),
		).toThrow(
			"pass runner: { describe, it } (under bun test: import them from 'bun:test')",
		);
	});

	it('closes the stores after a case, pass or fail', async () => {
		let closed = 0;
		const harness = {
			open: async () => ({
				stores: createMemoryStores(),
				close: async () => {
					closed += 1;
				},
			}),
		};
		const failing = {
			...allCases[0],
			id: 'x',
			run: async () => {
				throw new Error('boom');
			},
		} as (typeof allCases)[number];

		await runCase(allCases[0] as (typeof allCases)[number], harness);
		await runCase(failing, harness).then(
			() => {},
			() => {},
		);

		expect(closed).toBe(2);
	});
});
