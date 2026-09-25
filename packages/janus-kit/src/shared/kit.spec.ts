import { afterEach, describe, expect, it } from 'bun:test';
import type { JanusStores } from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import { assembleKit, type Closers } from './kit';

const database = { key: 'store', label: 'the store' } as const;
const auth = () => ({});

/** A database module that opens nothing but the closes it is given. */
function opening(...closes: (() => Promise<void>)[]) {
	return async (closers: Closers) => {
		closers.push(...closes);
		return {
			database,
			db: 'db',
			store: {} as JanusStores,
			relations: {} as RelationStore,
			probe: async () => ({ ok: true as const, latencyMs: 0 }),
		};
	};
}

const warnings: { message: string; code: string | undefined }[] = [];
const onWarning = (warning: Error & { code?: string }) => {
	warnings.push({ message: warning.message, code: warning.code });
};
process.on('warning', onWarning);
afterEach(() => {
	warnings.length = 0;
});

describe('assembleKit()', () => {
	it('closes in reverse of the opens, once however often close is called', async () => {
		const closed: string[] = [];
		const kit = await assembleKit(
			{ auth },
			opening(
				async () => void closed.push('first opened'),
				async () => void closed.push('last opened'),
			),
		);
		await Promise.all([kit.close(), kit.close(), kit[Symbol.asyncDispose]()]);
		expect(closed).toEqual(['last opened', 'first opened']);
	});

	it('reports the database under its key in ping', async () => {
		const kit = await assembleKit({ auth }, opening());
		expect(await kit.ping()).toEqual({
			ok: true,
			store: { ok: true, latencyMs: 0 },
		});
	});

	it('rejects close with the one failure, or an AggregateError of several, after closing the rest', async () => {
		const one = new Error('one');
		const closed: string[] = [];
		const single = await assembleKit(
			{ auth },
			opening(
				async () => void closed.push('kept closing'),
				async () => {
					throw one;
				},
			),
		);
		expect(
			await single.close().then(
				() => 'closed',
				(error) => error,
			),
		).toBe(one);
		expect(closed).toEqual(['kept closing']);

		const two = new Error('two');
		const several = await assembleKit(
			{ auth },
			opening(
				async () => {
					throw one;
				},
				async () => {
					throw two;
				},
			),
		);
		const error = await several.close().then(
			() => undefined,
			(failure: unknown) => failure,
		);
		expect(error).toBeInstanceOf(AggregateError);
		expect((error as AggregateError).message).toBe(
			'kit.close: several connections failed to close',
		);
		expect((error as AggregateError).errors).toEqual([two, one]);
	});

	it('rethrows what stopped the start, and only warns of a close that failed on the way out', async () => {
		const stopped = new Error('auth failed');
		const outcome = await assembleKit(
			{
				auth: () => {
					throw stopped;
				},
			},
			opening(async () => {
				throw new Error('socket gone');
			}),
		).then(
			() => undefined,
			(error: unknown) => error,
		);
		expect(outcome).toBe(stopped);
		await new Promise((resolve) => setImmediate(resolve));
		expect(warnings).toEqual([
			{
				message:
					'connectKit: a connection failed to close after the kit failed to start: Error: socket gone',
				code: 'JANUS_KIT_CLOSE_FAILED',
			},
		]);
	});

	it('closes what the database opened when the database module itself fails', async () => {
		const closed: string[] = [];
		const outcome = await assembleKit({ auth }, async (closers) => {
			closers.push(async () => void closed.push('client'));
			throw new Error('tables missing');
		}).then(
			() => 'resolved',
			(error: Error) => error.message,
		);
		expect(outcome).toBe('tables missing');
		expect(closed).toEqual(['client']);
	});
});
