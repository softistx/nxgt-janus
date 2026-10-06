import { describe, expect, test } from 'bun:test';
import { accessProblems, manifestShapeProblems } from './manifest';

describe('manifestShapeProblems', () => {
	const adapter = (
		peerDependencies: Record<string, string>,
		name = '@nxgt/janus-mongo',
	) => ({
		name,
		peerDependencies,
	});

	test('accepts a caret range on a sibling', () => {
		expect(
			manifestShapeProblems([
				{ name: '@nxgt/janus' },
				adapter({ '@nxgt/janus': '^0.2.0' }),
			]),
		).toEqual([]);
	});

	test('refuses an exact pin on a sibling: two copies, two StoreFailure classes', () => {
		const problems = manifestShapeProblems([
			{ name: '@nxgt/janus' },
			adapter({ '@nxgt/janus': '0.2.0' }),
		]);
		expect(problems).toEqual([
			expect.stringContaining('pins a sibling exactly'),
		]);
	});

	test('refuses a package that lists itself', () => {
		const problems = manifestShapeProblems([
			{ name: '@nxgt/janus', dependencies: { '@nxgt/janus': '.' } },
		]);
		expect(problems).toEqual([expect.stringContaining('lists itself')]);
	});

	/** `bun pm pack` resolves every `workspace:`; one left means it did not. */
	test('refuses a workspace: left in a field a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{ name: '@nxgt/janus' },
				{
					name: '@nxgt/janus-mongo',
					peerDependencies: { '@nxgt/janus': 'workspace:^' },
					devDependencies: { '@nxgt/janus': 'workspace:^' },
				},
			]),
		).toEqual([
			'@nxgt/janus-mongo: peerDependencies.@nxgt/janus = workspace:^, ' +
				'which `bun pm pack` should have resolved',
		]);
	});

	test('refuses link: and file: where a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{
					name: '@nxgt/janus',
					dependencies: { a: 'link:../a' },
					optionalDependencies: { b: 'file:../b' },
					devDependencies: { c: 'link:../c' },
				},
			]),
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
