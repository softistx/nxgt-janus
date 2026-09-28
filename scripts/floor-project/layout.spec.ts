import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { layOut, lockedVersions } from './layout';

let scratch = '';
const root = () => join(scratch, 'root');
const pkgDir = () => join(root(), 'packages/p');

async function write(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, content);
}

beforeEach(async () => {
	scratch = await mkdtemp(join(tmpdir(), 'floor-layout-'));
	await write(join(pkgDir(), 'package.json'), '{}');
	await write(join(pkgDir(), 'src/index.ts'), '');
	await write(join(pkgDir(), 'dist/index.js'), '');
	await write(join(pkgDir(), 'node_modules/lib/package.json'), '{}');
	await write(
		join(root(), 'node_modules/dep/package.json'),
		JSON.stringify({ version: '1.2.3' }),
	);
});
afterEach(() => rm(scratch, { recursive: true, force: true }));

describe('layOut', () => {
	test('copies the package at the same relative path, without what the install and the build made', async () => {
		await write(join(root(), 'tsconfig.base.json'), '{"x":1}');
		const project = join(scratch, 'project');
		const copy = await layOut(root(), pkgDir(), project);
		expect(copy).toBe(join(project, 'packages/p'));
		expect((await readdir(copy)).sort()).toEqual(['package.json', 'src']);
		expect(await Bun.file(join(project, 'tsconfig.base.json')).text()).toBe(
			'{"x":1}',
		);
	});

	test('copies no tsconfig.base.json when the root has none', async () => {
		const project = join(scratch, 'project');
		await layOut(root(), pkgDir(), project);
		expect(await Bun.file(join(project, 'tsconfig.base.json')).exists()).toBe(
			false,
		);
	});
});

describe('lockedVersions', () => {
	test('reads the exact version each name resolves to from the package', async () => {
		expect(await lockedVersions(pkgDir(), ['dep'])).toEqual({ dep: '1.2.3' });
	});

	test('refuses a name that does not resolve, and says to install', async () => {
		await expect(lockedVersions(pkgDir(), ['absent'])).rejects.toThrow(
			`absent does not resolve from ${pkgDir()}; run bun install`,
		);
	});
});
