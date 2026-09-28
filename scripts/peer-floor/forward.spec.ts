import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forwardSignals } from './forward';

let dir = '';
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'floor-forward-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('forwardSignals', () => {
	test('answers the command exit code', async () => {
		const signals = forwardSignals();
		try {
			expect(await signals.run(['bash', '-c', 'exit 4'], dir)).toBe(4);
		} finally {
			signals.dispose();
		}
	});

	test('answers 143 without running the command when SIGTERM came first', async () => {
		const signals = forwardSignals();
		try {
			process.emit('SIGTERM');
			expect(await signals.run(['touch', 'ran'], dir)).toBe(143);
			expect(await readdir(dir)).toEqual([]);
		} finally {
			signals.dispose();
		}
	});

	test('stops listening once disposed', () => {
		const before = process.listenerCount('SIGTERM');
		const signals = forwardSignals();
		expect(process.listenerCount('SIGTERM')).toBe(before + 1);
		expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
		signals.dispose();
		expect(process.listenerCount('SIGTERM')).toBe(before);
	});
});
