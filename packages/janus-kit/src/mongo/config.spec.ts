import { describe, expect, it } from 'bun:test';
import type { Db } from 'mongodb';
import { defineConfig } from './config';

const db = {} as Db;
const auth = () => ({});

/** Calls `defineConfig` with what the types would refuse, as JavaScript can. */
function refused(config: unknown): string {
	try {
		defineConfig(config as Parameters<typeof defineConfig>[0]);
	} catch (error) {
		expect(error).toBeInstanceOf(TypeError);
		return (error as Error).message;
	}
	throw new Error('defineConfig accepted it');
}

describe('defineConfig() over MongoDB', () => {
	it('answers the configuration, frozen, and connects to nothing', () => {
		const config = defineConfig({
			mongo: { url: 'mongodb+srv://nowhere.invalid/janus' },
			auth,
		});
		expect(Object.isFrozen(config)).toBe(true);
	});

	it('refuses a configuration without mongo, or with both of its sources', () => {
		expect(refused({ auth })).toContain('`mongo` is required');
		expect(refused({ mongo: {}, auth })).toBe(
			'defineConfig: `mongo` needs url or db.',
		);
		expect(refused({ mongo: { url: 'mongodb://x/janus', db }, auth })).toBe(
			'defineConfig: `mongo` has both url and db. Pass one.',
		);
		expect(
			refused({ mongo: { db, clientOptions: { appName: 'x' } }, auth }),
		).toContain('`mongo.clientOptions` beside `mongo.db`');
	});

	it('refuses a URL of another scheme, naming only its scheme', () => {
		expect(
			refused({ mongo: { url: 'postgres://root:s3cret@db/janus' }, auth }),
		).toBe(
			'defineConfig: `mongo.url` is a mongodb:// or mongodb+srv:// URL, not postgres://.',
		);
	});

	it('names MongoDB where sessions stay without Redis', () => {
		expect(refused({ mongo: { db }, redis: 'redis://x', auth })).toBe(
			'defineConfig: `redis` is { url } or { connection }, or absent to keep sessions in MongoDB.',
		);
	});
});
