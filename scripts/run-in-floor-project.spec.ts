import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runInFloorProject } from './run-in-floor-project';
import { workspacePerCase } from './run-in-floor-project.fixtures';

const ws = workspacePerCase();
const floor = { 'node_modules/lib': '1.0.0', 'node_modules/dep': '1.2.3' };

describe('runInFloorProject', () => {
	test('runs the command in the copied package on the floor, returns its code, and cleans up', async () => {
		const options = ws.options(floor);
		const code = await runInFloorProject(
			ws.root,
			ws.plan(
				'test -f src/index.ts && test ! -e dist && test -f ../../tsconfig.base.json && grep -q 1.0.0 ../../node_modules/lib/package.json && exit 3',
				['lib'],
			),
			options,
		);
		expect(code).toBe(3);
		expect(options.seen().packed).toEqual(['@x/p', '@x/sib']);
		expect(options.seen().manifest).toMatchObject({
			dependencies: { dep: '1.2.3', lib: '1.0.0' },
			overrides: { lib: '1.0.0' },
		});
		await ws.expectCleaned();
	});

	test('never copies what the install made into the project', async () => {
		const code = await runInFloorProject(
			ws.root,
			ws.plan('test ! -e node_modules'),
			ws.options(floor),
		);
		expect(code).toBe(0);
	});

	test('refuses a floor outside the peer range before making anything', async () => {
		const plan = {
			...ws.plan('exit 0'),
			floors: [{ name: 'lib', version: '0.9.0' }],
		};
		const run = runInFloorProject(ws.root, plan, ws.options(floor));
		await expect(run).rejects.toThrow("lib 0.9.0 is outside @x/p's ^1 || ^2");
		await ws.expectCleaned();
	});

	test('refuses a second copy of a single floor, and cleans up', async () => {
		const options = ws.options({
			...floor,
			'node_modules/other': '1.0.0',
			'node_modules/other/node_modules/lib': '2.0.0',
		});
		const run = runInFloorProject(ws.root, ws.plan('exit 0', ['lib']), options);
		await expect(run).rejects.toThrow(
			'lib: one copy at 1.0.0 expected, found 1.0.0 at node_modules/lib, 2.0.0 at node_modules/other/node_modules/lib',
		);
		await ws.expectCleaned();
	});

	test('refuses an install the packed package resolves another version from', async () => {
		const options = ws.options({
			...floor,
			'node_modules/@x/p/node_modules/lib': '2.0.0',
		});
		const run = runInFloorProject(ws.root, ws.plan('exit 0'), options);
		await expect(run).rejects.toThrow(
			'node_modules/@x/p resolves lib 2.0.0, not 1.0.0',
		);
		await ws.expectCleaned();
	});

	test('refuses a packed package that does not load', async () => {
		const options = ws.options(floor, 'throw new Error("boom");\n');
		const run = runInFloorProject(ws.root, ws.plan('exit 0'), options);
		await expect(run).rejects.toThrow('@x/p does not load on the floors');
		await ws.expectCleaned();
	});

	test('forwards SIGTERM to the command, returns 143, and cleans up', async () => {
		const run = runInFloorProject(
			ws.root,
			ws.plan('touch ../../started && exec sleep 5'),
			ws.options(floor),
		);
		const running = async () => {
			const [dir] = await readdir(ws.tmp);
			if (dir === undefined) return false;
			return Bun.file(join(ws.tmp, dir, 'project/started')).exists();
		};
		while (!(await running())) await Bun.sleep(10);
		await Bun.sleep(50);
		process.emit('SIGTERM');
		expect(await run).toBe(143);
		await ws.expectCleaned();
	});
});
