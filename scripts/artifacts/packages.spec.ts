import { describe, expect, test } from 'bun:test';
import { subpathsOf } from './packages';

describe('subpathsOf', () => {
	test('names every exported subpath, and not package.json', () => {
		expect(
			subpathsOf('@nxgt/janus', {
				'.': {},
				'./identities': {},
				'./conformance': {},
				'./package.json': './package.json',
			}),
		).toEqual([
			'@nxgt/janus',
			'@nxgt/janus/identities',
			'@nxgt/janus/conformance',
		]);
	});
});
