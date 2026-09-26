import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { namesIn, read, refusals } from './check-changesets';

const workspaces = [
	{ name: '@nxgt/janus', private: false },
	{ name: '@nxgt/janus-kit', private: true },
];

const changeset = (front: string) => `---\n${front}\n---\n\nA change.\n`;

describe('namesIn', () => {
	test('reads every package the front matter bumps, quoted or not', () => {
		expect(
			namesIn(changeset(`"@nxgt/janus": minor\n'@nxgt/janus-kit': patch`)),
		).toEqual(['@nxgt/janus', '@nxgt/janus-kit']);
	});

	test('reads the shapes changesets accepts: CRLF, a byte-order mark', () => {
		expect(namesIn('---\r\n"@nxgt/janus": patch\r\n---\r\n\r\nA.\r\n')).toEqual(
			['@nxgt/janus'],
		);
		expect(namesIn(`﻿${changeset('"@nxgt/janus": patch')}`)).toEqual([
			'@nxgt/janus',
		]);
	});

	test('reads nothing of the body, and nothing of an empty changeset', () => {
		expect(namesIn('---\n---\n\n"@nxgt/janus": minor\n')).toEqual([]);
	});

	test('answers null for what changesets cannot read', () => {
		expect(namesIn('"@nxgt/janus": minor\n')).toBeNull();
	});
});

describe('refusals', () => {
	test('lets a changeset for published packages through', () => {
		expect(
			refusals(
				[{ file: '.changeset/a.md', text: changeset('"@nxgt/janus": patch') }],
				workspaces,
			),
		).toEqual([]);
	});

	test('refuses a changeset naming a private package, and says how to publish it', () => {
		expect(
			refusals(
				[
					{
						file: '.changeset/kit.md',
						text: changeset('"@nxgt/janus": patch\n"@nxgt/janus-kit": minor'),
					},
				],
				workspaces,
			),
		).toEqual([
			'.changeset/kit.md: @nxgt/janus-kit is private — publish it in a commit of its own that removes "private", with this changeset',
		]);
	});

	test('refuses a package that does not exist: a typo is a release that never happens', () => {
		expect(
			refusals(
				[
					{
						file: '.changeset/typo.md',
						text: changeset('"@nxgt/janu": patch'),
					},
				],
				workspaces,
			),
		).toEqual([
			'.changeset/typo.md: @nxgt/janu is not a package of this repository',
		]);
	});

	test('refuses a changeset it cannot read, rather than letting it through', () => {
		expect(
			refusals(
				[{ file: '.changeset/bad.md', text: '"@nxgt/janus": patch\n' }],
				workspaces,
			),
		).toEqual(['.changeset/bad.md: changesets cannot read its front matter']);
	});
});

describe('read', () => {
	test('reads the changesets and the packages, private or not, and nothing else', async () => {
		const root = await mkdtemp(join(tmpdir(), 'check-changesets-'));
		await mkdir(join(root, '.changeset'));
		await writeFile(join(root, '.changeset', 'README.md'), '# Changesets\n');
		await writeFile(join(root, '.changeset', 'config.json'), '{}\n');
		await writeFile(
			join(root, '.changeset', 'one.md'),
			changeset('"@nxgt/janus": patch'),
		);
		for (const [dir, manifest] of [
			['janus', { name: '@nxgt/janus' }],
			['kit', { name: '@nxgt/janus-kit', private: true }],
			['odd', { name: '@nxgt/odd', private: 'yes' }],
		] as const) {
			await mkdir(join(root, 'packages', dir), { recursive: true });
			await writeFile(
				join(root, 'packages', dir, 'package.json'),
				JSON.stringify(manifest),
			);
		}
		await mkdir(join(root, 'packages', 'no-manifest'));

		const { changesets, workspaces: found } = await read(root);

		expect(changesets.map((one) => one.file)).toEqual(['.changeset/one.md']);
		expect(found.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
			{ name: '@nxgt/janus', private: false },
			{ name: '@nxgt/janus-kit', private: true },
			{ name: '@nxgt/odd', private: false },
		]);
	});
});
