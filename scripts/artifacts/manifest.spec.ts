import { describe, expect, test } from 'bun:test';
import { accessProblems, manifestShapeProblems } from './manifest';

describe('manifestShapeProblems', () => {
	const versions = { '@nxgt/janus': '0.2.0', '@nxgt/janus-mongo': '0.1.0' };
	const adapter = (
		peerDependencies: Record<string, string>,
		name = '@nxgt/janus-mongo',
	) => ({
		name,
		peerDependencies,
	});

	test('accepts a caret range on a sibling that includes it', () => {
		expect(
			manifestShapeProblems(
				[{ name: '@nxgt/janus' }, adapter({ '@nxgt/janus': '^0.2.0' })],
				versions,
			),
		).toEqual([]);
	});

	test('refuses an exact pin on a sibling: two copies, two StoreFailure classes', () => {
		const problems = manifestShapeProblems(
			[{ name: '@nxgt/janus' }, adapter({ '@nxgt/janus': '0.2.0' })],
			versions,
		);
		expect(problems).toEqual([
			expect.stringContaining('pins a sibling exactly'),
		]);
	});

	test('refuses a sibling range that leaves out the sibling beside it', () => {
		const problems = manifestShapeProblems(
			[{ name: '@nxgt/janus' }, adapter({ '@nxgt/janus': '^0.1.0' })],
			versions,
		);
		expect(problems).toEqual([
			expect.stringContaining('leaves out @nxgt/janus@0.2.0'),
		]);
	});

	test('refuses a package that lists itself', () => {
		const problems = manifestShapeProblems(
			[{ name: '@nxgt/janus', dependencies: { '@nxgt/janus': '.' } }],
			{},
		);
		expect(problems).toEqual([expect.stringContaining('lists itself')]);
	});

	test('refuses link: and file: where a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems(
				[
					{
						name: '@nxgt/janus',
						dependencies: { a: 'link:../a' },
						optionalDependencies: { b: 'file:../b' },
						devDependencies: { c: 'link:../c' },
					},
				],
				{},
			),
		).toEqual([
			'@nxgt/janus: dependencies.a = link:../a',
			'@nxgt/janus: optionalDependencies.b = file:../b',
		]);
	});
});

describe('accessProblems', () => {
	test('accepts a scoped package published as public', () => {
		expect(
			accessProblems({
				name: '@nxgt/janus',
				publishConfig: { access: 'public' },
			}),
		).toEqual([]);
	});

	test('refuses a scoped package with no publishConfig', () => {
		expect(accessProblems({ name: '@nxgt/janus' })).toEqual([
			'@nxgt/janus: publishConfig.access is not "public"; bun publish would publish this scoped package as restricted',
		]);
	});
});
