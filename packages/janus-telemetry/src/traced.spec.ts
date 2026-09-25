import { describe, expect, it } from 'bun:test';
import { CredentialError } from '@nxgt/janus';
import { collect, rejection } from '../test/collect';
import { traced } from './traced';

const broken = () => {
	throw new Error('a signal went wrong');
};

describe('traced()', () => {
	it('answers what the call answered, even when writing its signals throws', async () => {
		let answer: unknown;
		const { spans } = await collect(async () => {
			answer = await traced('janus.probe', {}, async () => 42, broken);
		});

		expect(answer).toBe(42);
		expect(spans.find((span) => span.name === 'janus.probe')?.status).toBe(
			'ok',
		);
	});

	it('rethrows the refusal, not the throw of its signals', async () => {
		const refusal = new CredentialError('CREDENTIALS_INVALID', 'refused');
		let thrown: unknown;
		const { spans } = await collect(async () => {
			thrown = await rejection(
				traced('janus.probe', {}, () => Promise.reject(refusal), broken),
			);
		});

		expect(thrown).toBe(refusal);
		const probe = spans.find((span) => span.name === 'janus.probe');
		expect(probe?.status).toBe('ok');
		expect(probe?.attributes['janus.refusal']).toBe('CREDENTIALS_INVALID');
	});

	it('fails the span on a failure code', async () => {
		const failure = new CredentialError('HASH_UNSUPPORTED', 'unknown hash');
		const { spans } = await collect(async () => {
			await rejection(
				traced(
					'janus.probe',
					{},
					() => Promise.reject(failure),
					() => {},
				),
			);
		});

		const probe = spans.find((span) => span.name === 'janus.probe');
		expect(probe?.status).toBe('error');
		expect(probe?.attributes['janus.error.code']).toBe('HASH_UNSUPPORTED');
	});
});
