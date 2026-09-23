import { describe, expect, it } from 'bun:test';
import { InvalidCursorError } from '../errors/janus-error';
import {
	DEFAULT_PAGE_SIZE,
	invalidCursor,
	MAX_PAGE_SIZE,
	pageLimit,
} from './cursor-page';

describe('pageLimit', () => {
	it('defaults when the caller said nothing', () => {
		expect(pageLimit(undefined, 'listIdentities')).toBe(DEFAULT_PAGE_SIZE);
	});

	it('bounds in the core, so two stores cannot disagree', () => {
		// An application that asks one store for a million rows and is refused
		// by another has a bug that only shows on one deployment.
		expect(pageLimit(1_000_000, 'listIdentities')).toBe(MAX_PAGE_SIZE);
		expect(pageLimit(1, 'listIdentities')).toBe(1);
	});

	it('names the call the consumer wrote, not an internal function', () => {
		// Several calls here take a `limit`; a message that does not say which
		// leaves the reader to guess.
		expect(() => pageLimit(0, 'listSessionsByIdentity')).toThrow(
			/^listSessionsByIdentity: limit must be an integer of at least 1/,
		);
	});

	it('refuses a non-integer and a negative, with a bare TypeError', () => {
		// A limit is written in the application's own code, so this cannot come
		// from a request.
		for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => pageLimit(bad, 'listIdentities')).toThrow(TypeError);
		}
	});
});

describe('invalidCursor', () => {
	it('is the package’s own class, so instanceof works across packages', () => {
		// An adapter throws this. If it defined its own, `instanceof` would be
		// false in the core and the refusal would read as something else.
		const error = invalidCursor('listIdentities', 'abcdef');

		expect(error).toBeInstanceOf(InvalidCursorError);
		expect(error.code).toBe('INVALID_CURSOR');
	});

	it('reports the cursor’s length and not its bytes', () => {
		const error = invalidCursor('listIdentities', 'x'.repeat(64));

		expect(error.message).toContain('64 characters');
		expect(error.message).not.toContain('xxxx');
	});
});
