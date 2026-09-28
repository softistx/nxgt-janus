import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	mkdir,
	mkdtemp,
	readdir,
	readlink,
	rm,
	symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Plan } from './peer-floor/plan';
import { runOnFloor } from './run-on-peer-floor';

/**
 * A scratch tree laid out as Bun's isolated install lays it out: `@x/lib`
 * 2.0.0 in the store beside its peer `dep` 1.0.0, linked from
 * `packages/a` and `packages/b`. The floor is `@x/lib` 1.0.0.
 */
let scratch: string;
let root: string;
let tmp: string;
const ORIGINAL =
	'../../../../node_modules/.bun/@x+lib@2.0.0/node_modules/@x/lib';
const links = () =>
	['a', 'b'].map((pkg) => join(root, 'packages', pkg, 'node_modules/@x/lib'));

async function write(path: string, json: object): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, JSON.stringify(json));
}

async function tarball(peerRange: string): Promise<Uint8Array> {
	const src = join(scratch, `src-${peerRange}`);
	await write(join(src, 'package/package.json'), {
		name: '@x/lib',
		version: '1.0.0',
		peerDependencies: { dep: peerRange },
	});
	const file = join(scratch, `lib-${peerRange}.tgz`);
	await Bun.spawn(['tar', '-czf', file, '-C', src, 'package']).exited;
	return new Uint8Array(await Bun.file(file).arrayBuffer());
}

const plan = (command: string): Plan => ({
	name: '@x/lib',
	version: '1.0.0',
	packages: ['a', 'b'],
	command: ['sh', '-c', command],
});

async function expectUntouched(): Promise<void> {
	for (const link of links()) expect(await readlink(link)).toBe(ORIGINAL);
	expect(await readdir(tmp)).toEqual([]);
}

beforeEach(async () => {
	scratch = await mkdtemp(join(tmpdir(), 'peer-floor-spec-'));
	root = join(scratch, 'root');
	tmp = join(scratch, 'tmp');
	await mkdir(tmp);
	const store = join(root, 'node_modules/.bun');
	await write(join(store, '@x+lib@2.0.0/node_modules/@x/lib/package.json'), {
		name: '@x/lib',
		version: '2.0.0',
	});
	await write(join(store, 'dep@1.0.0/node_modules/dep/package.json'), {
		name: 'dep',
		version: '1.0.0',
	});
	await symlink(
		'../../dep@1.0.0/node_modules/dep',
		join(store, '@x+lib@2.0.0/node_modules/dep'),
	);
	for (const link of links()) {
		await mkdir(dirname(link), { recursive: true });
		await symlink(ORIGINAL, link);
	}
});

afterEach(async () => {
	await rm(scratch, { recursive: true, force: true });
});

describe('runOnFloor', () => {
	test('runs the command on the floor, returns its code, and puts everything back', async () => {
		const bytes = await tarball('^1');
		const code = await runOnFloor(
			root,
			plan(
				'grep -q 1.0.0 packages/a/node_modules/@x/lib/package.json && grep -q 1.0.0 packages/b/node_modules/@x/lib/package.json && exit 3',
			),
			{ download: async () => bytes, tmp },
		);
		expect(code).toBe(3);
		await expectUntouched();
	});

	test('refuses a floor whose peer range the staged peer is outside of, and puts everything back', async () => {
		const bytes = await tarball('^2');
		const run = runOnFloor(root, plan('exit 0'), {
			download: async () => bytes,
			tmp,
		});
		await expect(run).rejects.toThrow('dep 1.0.0 is outside its range ^2');
		await expectUntouched();
	});

	test('leaves the tree as it was when the download fails', async () => {
		const run = runOnFloor(root, plan('exit 0'), {
			download: () => Promise.reject(new Error('registry 503')),
			tmp,
		});
		await expect(run).rejects.toThrow('registry 503');
		await expectUntouched();
	});

	test('refuses a link an interrupted run left behind', async () => {
		const [a] = links();
		await rm(a as string);
		await symlink(join(scratch, 'gone'), a as string);
		const run = runOnFloor(root, plan('exit 0'), {
			download: () => tarball('^1'),
			tmp,
		});
		await expect(run).rejects.toThrow('left by an interrupted run');
		expect(await readdir(tmp)).toEqual([]);
	});

	test('refuses packages that resolve two copies', async () => {
		const other = join(
			root,
			'node_modules/.bun/@x+lib@2.0.1/node_modules/@x/lib',
		);
		await write(join(other, 'package.json'), { version: '2.0.1' });
		const [, b] = links();
		await rm(b as string);
		await symlink(other, b as string);
		const run = runOnFloor(root, plan('exit 0'), {
			download: () => tarball('^1'),
			tmp,
		});
		await expect(run).rejects.toThrow('resolves another copy');
	});
});
