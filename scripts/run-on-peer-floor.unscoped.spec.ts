import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { runOnFloor } from './run-on-peer-floor';
import { isolatedInstallPerCase } from './run-on-peer-floor.fixtures';

/** The same tree with an unscoped peer, as `graphql` is. */
const install = isolatedInstallPerCase('lib');
const { tarball, plan, expectUntouched } = install;

describe('runOnFloor', () => {
	// `lib/../dep` is read through the link, so it is the staged sibling.
	test('runs the command on an unscoped floor beside its peer, and puts everything back', async () => {
		const bytes = await tarball('^1');
		const code = await runOnFloor(
			install.root,
			plan(
				'grep -q 1.0.0 packages/a/node_modules/lib/package.json && grep -q 1.0.0 packages/b/node_modules/lib/package.json && grep -q 1.0.0 packages/a/node_modules/lib/../dep/package.json && exit 3',
			),
			{ download: async () => bytes, tmp: install.tmp },
		);
		expect(code).toBe(3);
		await expectUntouched();
	});

	test('refuses an unscoped floor whose peer range the staged peer is outside of, and puts everything back', async () => {
		const bytes = await tarball('^2');
		const run = runOnFloor(install.root, plan('exit 0'), {
			download: async () => bytes,
			tmp: install.tmp,
		});
		await expect(run).rejects.toThrow('dep 1.0.0 is outside its range ^2');
		await expectUntouched();
	});

	test('names the unscoped link it refuses', async () => {
		const run = runOnFloor(
			install.root,
			{ ...plan('exit 0'), packages: ['a', 'missing'] },
			{ download: () => tarball('^1'), tmp: install.tmp },
		);
		await expect(run).rejects.toThrow(
			'packages/missing/node_modules/lib is not a link',
		);
		expect(await readdir(install.tmp)).toEqual([]);
	});
});
