import { describe, expect, it } from 'bun:test';
import { person } from '../../test/auth';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';

describe('janus({ events })', () => {
	it('refuses a listener that is not a function', () => {
		expect(() =>
			janus({
				user: person,
				store: createMemoryStores(),
				// @ts-expect-error events is a function
				events: { 'user.created': () => {} },
			}),
		).toThrow(
			'janus: events must be a function that takes a user event — webhooks({ … }) from @nxgt/janus-webhooks, or your own',
		);
	});
});
