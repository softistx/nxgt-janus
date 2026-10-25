import { describe, expect, it } from 'bun:test';
import { toJanusAvatar } from './index';

const at = new Date('2026-10-24T08:30:00.000Z');
const ada = { id: 'u1', avatar: { id: 'img-1', updatedAt: at } };
const bob = { id: 'u2', avatar: null };

describe('toJanusAvatar', () => {
	it('is null for a user with no avatar', () => {
		expect(toJanusAvatar(bob)).toBeNull();
	});

	it('carries the owner, the id and the date', () => {
		expect(toJanusAvatar(ada)).toEqual({
			userId: 'u1',
			id: 'img-1',
			updatedAt: at,
		});
	});
});
