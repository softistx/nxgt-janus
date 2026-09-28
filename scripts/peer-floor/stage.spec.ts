import { describe, expect, test } from 'bun:test';
import { unmet } from './stage';

describe('unmet', () => {
	const floor = {
		dependencies: { defu: '^6.1.4' },
		peerDependencies: {
			mongodb: '>=7.0.0 <8',
			'@opentelemetry/api': '^1.9.0',
		},
		peerDependenciesMeta: { '@opentelemetry/api': { optional: true } },
	};

	test('is empty when everything staged is in range', () => {
		expect(unmet(floor, { defu: '6.1.4', mongodb: '7.6.0' })).toEqual([]);
	});

	test('names a missing dependency or required peer, not a missing optional one', () => {
		expect(unmet(floor, {})).toEqual([
			'defu ^6.1.4 is not installed beside it',
			'mongodb >=7.0.0 <8 is not installed beside it',
		]);
	});

	test('names anything staged outside its range, optional peers included', () => {
		expect(
			unmet(floor, {
				defu: '6.1.4',
				mongodb: '8.0.0',
				'@opentelemetry/api': '2.0.0',
			}),
		).toEqual([
			'mongodb 8.0.0 is outside its range >=7.0.0 <8',
			'@opentelemetry/api 2.0.0 is outside its range ^1.9.0',
		]);
	});

	test('is empty for a floor that declares nothing', () => {
		expect(unmet({}, { typescript: '6.0.3' })).toEqual([]);
	});
});
