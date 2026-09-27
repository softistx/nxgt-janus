import { describe, expect, it } from 'bun:test';
import { permissions } from './engine';
import { model } from './engine.fixtures';
import { createMemoryRelations } from './port/memory';

describe('wiring', () => {
	it('refuses a store missing a method, and a maxDepth under 1', () => {
		const { findObjects: _, ...partial } = createMemoryRelations();

		expect(() => permissions({ model, store: partial as never })).toThrow(
			'store.findObjects is missing',
		);
		expect(() =>
			permissions({ model, store: createMemoryRelations(), maxDepth: 0 }),
		).toThrow('maxDepth must be a positive integer');
	});
});
