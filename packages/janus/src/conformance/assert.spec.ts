import { describe, expect, it } from 'bun:test';
import { StoreFailure } from '../errors/janus-error';
import { isOurs } from './assert';

describe('isOurs', () => {
	const what = 'users.findUser under an outage';

	it('passes this package’s own class', () => {
		expect(() =>
			isOurs(
				new StoreFailure('down', { cause: null }),
				StoreFailure,
				'StoreFailure',
				what,
			),
		).not.toThrow();
	});

	it('names two copies of @nxgt/janus when the class a bundler renamed is not this one', () => {
		// What `dist` holds: the class renamed on a collision, its `name`
		// field untouched — and a second copy's error carrying that name.
		class StoreFailure2 extends Error {
			override name = 'StoreFailure';
		}
		const theirs = Object.assign(new Error('down'), { name: 'StoreFailure' });

		expect(() => isOurs(theirs, StoreFailure2, 'StoreFailure', what)).toThrow(
			"the error is named StoreFailure but is not @nxgt/janus's StoreFailure: two copies of @nxgt/janus are installed",
		);
	});

	it('names what it expected for any other error', () => {
		expect(() =>
			isOurs(new TypeError('x'), StoreFailure, 'StoreFailure', what),
		).toThrow('expected StoreFailure, got');
	});
});
