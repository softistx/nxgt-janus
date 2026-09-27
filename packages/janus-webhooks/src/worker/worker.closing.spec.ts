import { describe, expect, it } from 'bun:test';
import { webhooks } from '../deliver';
import { endpoints, eventOf, givingUps, held, until } from './worker.fixtures';

// What close() still sends when every slot is busy.

describe('close(), without a queue, every slot busy', () => {
	it('still sends the first attempt of every event it took before close()', async () => {
		const { answers, fetch } = held();
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints,
			concurrency: 1,
			fetch,
			onGivingUp,
		});

		listener(eventOf());
		listener(eventOf());
		const closing = listener.close();
		await until(() => answers.length === 1);
		answers[0]?.(200);
		await until(() => answers.length === 2);
		answers[1]?.(200);
		await closing;

		expect(given).toEqual([]);
	});
});
