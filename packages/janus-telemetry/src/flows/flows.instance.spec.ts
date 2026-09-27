import { describe, expect, it } from 'bun:test';
import { setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('leaves the cookie synchronous, and the instance otherwise the same', () => {
		const { auth } = setup();
		expect(typeof auth.cookie.clear()).toBe('string');
		expect(auth.types).toEqual(['patient', 'staff']);
		expect(auth.patient).toBe(auth.patient); // traced once, not per read
		expect(Object.isFrozen(auth)).toBe(true);
	});
});
