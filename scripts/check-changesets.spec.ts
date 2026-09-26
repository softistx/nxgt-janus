import { describe, expect, test } from 'bun:test';
import { namesIn, refusals } from './check-changesets';

const workspaces = [
	{ name: '@nxgt/janus', private: false },
	{ name: '@nxgt/janus-kit', private: true },
];

const changeset = (front: string) => `---\n${front}\n---\n\nA change.\n`;

describe('namesIn', () => {
	test('reads every package the front matter bumps, quoted or not', () => {
		expect(
			namesIn(
				changeset(
					`"@nxgt/janus": minor\n'@nxgt/janus-kit': patch\nplain: major`,
				),
			),
		).toEqual(['@nxgt/janus', '@nxgt/janus-kit', 'plain']);
	});

	test('reads nothing of the body, and nothing of an empty changeset', () => {
		expect(namesIn('---\n---\n\n"@nxgt/janus": minor\n')).toEqual([]);
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
});
