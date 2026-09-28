import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { copiesOf, installProblems, resolveFrom, versionFrom } from './copies';

let root = '';

async function pkg(path: string, version: string): Promise<void> {
	const file = join(root, path, 'package.json');
	await mkdir(dirname(file), { recursive: true });
	await Bun.write(file, JSON.stringify({ version }));
}

// A hoisted tree: graphql 16.9.0 on top, a second copy under `yoga`, and
// `@s/tools` 2.0.0 nested under `@s/other`.
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'floor-copies-'));
	await pkg('node_modules/graphql', '16.9.0');
	await pkg('node_modules/@s/tools', '1.0.0');
	await pkg('node_modules/yoga', '5.0.0');
	await pkg('node_modules/@s/other', '1.0.0');
	await pkg('node_modules/@s/other/node_modules/@s/tools', '2.0.0');
	await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
	await mkdir(join(root, 'packages/p/src'), { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));

const nestGraphql = () =>
	pkg('node_modules/yoga/node_modules/graphql', '17.0.2');

describe('resolveFrom', () => {
	test('finds the first node_modules/<name> walking up', async () => {
		expect(await resolveFrom(join(root, 'packages/p/src'), 'graphql')).toBe(
			join(root, 'node_modules/graphql'),
		);
		expect(
			await versionFrom(join(root, 'node_modules/@s/other'), '@s/tools'),
		).toBe('2.0.0');
	});

	test('answers undefined for a name nothing holds', async () => {
		expect(await resolveFrom(join(root, 'packages/p'), 'absent')).toBe(
			undefined,
		);
	});
});

describe('copiesOf', () => {
	test('lists the top-level copy and each nested one, scoped or not', async () => {
		await nestGraphql();
		expect(await copiesOf(root, 'graphql')).toEqual([
			{ path: 'node_modules/graphql', version: '16.9.0' },
			{ path: 'node_modules/yoga/node_modules/graphql', version: '17.0.2' },
		]);
		expect(await copiesOf(root, '@s/tools')).toEqual([
			{
				path: 'node_modules/@s/other/node_modules/@s/tools',
				version: '2.0.0',
			},
			{ path: 'node_modules/@s/tools', version: '1.0.0' },
		]);
	});

	test('answers no copy for a name nothing holds', async () => {
		expect(await copiesOf(root, 'absent')).toEqual([]);
	});
});

describe('installProblems', () => {
	const floors = [
		{ name: 'graphql', version: '16.9.0' },
		{ name: '@s/tools', version: '1.0.0' },
	];
	const from = () => [
		join(root, 'packages/p'),
		join(root, 'node_modules/yoga'),
	];

	test('passes one single copy at the floor, resolved from every directory', async () => {
		expect(await installProblems(root, from(), floors, ['graphql'])).toEqual(
			[],
		);
	});

	test('refuses a second copy of a single floor, and a directory resolving it', async () => {
		await nestGraphql();
		expect(await installProblems(root, from(), floors, ['graphql'])).toEqual([
			'graphql: one copy at 16.9.0 expected, found 16.9.0 at node_modules/graphql, 17.0.2 at node_modules/yoga/node_modules/graphql',
			'node_modules/yoga resolves graphql 17.0.2, not 16.9.0',
		]);
	});

	test('refuses a single copy at another version than the floor', async () => {
		await pkg('node_modules/graphql', '17.0.2');
		const problems = await installProblems(root, [], floors, ['graphql']);
		expect(problems).toEqual([
			'graphql: one copy at 16.9.0 expected, found 17.0.2 at node_modules/graphql',
		]);
	});

	test('refuses a floor that does not resolve at all', async () => {
		await rm(join(root, 'node_modules/@s/tools'), { recursive: true });
		expect(
			await installProblems(root, [join(root, 'packages/p')], floors, []),
		).toEqual(['packages/p resolves @s/tools nowhere, not 1.0.0']);
	});
});
