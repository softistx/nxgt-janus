import { describe, expect, test } from 'bun:test';
import {
	carriedOf,
	floorProblems,
	type PackageManifest,
	projectManifest,
	siblingsOf,
} from './manifest';

const manifest: PackageManifest = {
	name: '@nxgt/janus-graphql',
	devDependencies: {
		'@nxgt/janus': 'workspace:^',
		graphql: '^17.0.2',
		'graphql-yoga': '^5.24.1',
		zod: '^4.6.5',
	},
	peerDependencies: {
		'@nxgt/janus': 'workspace:^',
		graphql: '^16.9.0 || ^17.0.0',
		'@envelop/core': '^5.0.0',
		typescript: '^6.0.3',
	},
};
const floors = [
	{ name: 'graphql', version: '16.9.0' },
	{ name: '@envelop/core', version: '5.0.0' },
];

describe('siblingsOf', () => {
	test('names what the package lists by workspace:, once', () => {
		expect(siblingsOf(manifest)).toEqual(['@nxgt/janus']);
	});
});

describe('carriedOf', () => {
	test('names everything listed but the floors and the siblings', () => {
		expect(carriedOf(manifest, floors).sort()).toEqual([
			'graphql-yoga',
			'typescript',
			'zod',
		]);
	});
});

describe('floorProblems', () => {
	test('accepts the lower bound of each peer range', () => {
		expect(floorProblems(manifest, floors)).toEqual([]);
	});

	test('refuses a floor outside the range, and a name that is no peer', () => {
		expect(
			floorProblems(manifest, [
				{ name: 'graphql', version: '16.8.0' },
				{ name: 'zod', version: '4.0.0' },
			]),
		).toEqual([
			"graphql 16.8.0 is outside @nxgt/janus-graphql's ^16.9.0 || ^17.0.0",
			'zod is not a peer of @nxgt/janus-graphql',
		]);
	});
});

describe('projectManifest', () => {
	test('pins everything exact, and overrides the single floors and the tarballs', () => {
		const json = projectManifest({
			plan: {
				package: 'janus-graphql',
				floors,
				single: ['graphql'],
				command: ['x'],
			},
			tarballs: {
				'@nxgt/janus-graphql': 'file:/t/g.tgz',
				'@nxgt/janus': 'file:/t/j.tgz',
			},
			carried: { zod: '4.6.5', typescript: '6.0.3' },
		});
		expect(json.dependencies).toEqual({
			zod: '4.6.5',
			typescript: '6.0.3',
			graphql: '16.9.0',
			'@envelop/core': '5.0.0',
			'@nxgt/janus-graphql': 'file:/t/g.tgz',
			'@nxgt/janus': 'file:/t/j.tgz',
		});
		expect(json.overrides).toEqual({
			graphql: '16.9.0',
			'@nxgt/janus-graphql': 'file:/t/g.tgz',
			'@nxgt/janus': 'file:/t/j.tgz',
		});
		expect(json.private).toBe(true);
	});
});
