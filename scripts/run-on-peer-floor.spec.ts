import { describe, expect, test } from 'bun:test';
import { readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { runOnFloor } from './run-on-peer-floor';
import { isolatedInstallPerCase, write } from './run-on-peer-floor.fixtures';

const install = isolatedInstallPerCase('@x/lib');
const { links, tarball, plan, expectUntouched } = install;

describe('runOnFloor', () => {
	test('runs the command on the floor, returns its code, and puts everything back', async () => {
		const bytes = await tarball('^1');
		const code = await runOnFloor(
			install.root,
			plan(
				'grep -q 1.0.0 packages/a/node_modules/@x/lib/package.json && grep -q 1.0.0 packages/b/node_modules/@x/lib/package.json && exit 3',
			),
			{ download: async () => bytes, tmp: install.tmp },
		);
		expect(code).toBe(3);
		await expectUntouched();
	});

	test('refuses a floor whose peer range the staged peer is outside of, and puts everything back', async () => {
		const bytes = await tarball('^2');
		const run = runOnFloor(install.root, plan('exit 0'), {
			download: async () => bytes,
			tmp: install.tmp,
		});
		await expect(run).rejects.toThrow('dep 1.0.0 is outside its range ^2');
		await expectUntouched();
	});

	// SIGTERM, not SIGINT: the SIGINT version timed out on GitHub Actions,
	// where `sleep` outlived the forwarded signal — a job started with SIGINT
	// ignored passes that on to every child. The two share one path here.
	test('forwards SIGTERM to the command, returns 143, and puts everything back', async () => {
		const bytes = await tarball('^1');
		const run = runOnFloor(install.root, plan('exec sleep 5'), {
			download: async () => bytes,
			tmp: install.tmp,
		});
		const [a] = links();
		const floored = async () =>
			(await Bun.file(join(a as string, 'package.json'))
				.json()
				.catch(() => ({}))) as { version?: string };
		while ((await floored()).version !== '1.0.0') await Bun.sleep(10);
		await Bun.sleep(50);
		process.emit('SIGTERM');
		expect(await run).toBe(143);
		await expectUntouched();
	});

	test('leaves the tree as it was when the download fails', async () => {
		const run = runOnFloor(install.root, plan('exit 0'), {
			download: () => Promise.reject(new Error('registry 503')),
			tmp: install.tmp,
		});
		await expect(run).rejects.toThrow('registry 503');
		await expectUntouched();
	});

	test('refuses a link an interrupted run left behind', async () => {
		const [a] = links();
		await rm(a as string);
		await symlink(join(install.scratch, 'gone'), a as string);
		const run = runOnFloor(install.root, plan('exit 0'), {
			download: () => tarball('^1'),
			tmp: install.tmp,
		});
		await expect(run).rejects.toThrow('left by an interrupted run');
		expect(await readdir(install.tmp)).toEqual([]);
	});

	test('refuses packages that resolve two copies', async () => {
		const other = join(
			install.root,
			'node_modules/.bun/@x+lib@2.0.1/node_modules/@x/lib',
		);
		await write(join(other, 'package.json'), { version: '2.0.1' });
		const [, b] = links();
		await rm(b as string);
		await symlink(other, b as string);
		const run = runOnFloor(install.root, plan('exit 0'), {
			download: () => tarball('^1'),
			tmp: install.tmp,
		});
		await expect(run).rejects.toThrow('resolves another copy');
	});
});
