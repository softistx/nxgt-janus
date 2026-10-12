import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { createMemoryStores } from '../port/memory';
import { changing, NEW_EMAIL, verifiedAda } from './change-email.fixtures';

describe('changeEmail, and an outage', () => {
	it('send is STORE_FAILED when the token cannot be stored', async () => {
		const memory = createMemoryStores();
		let down = false;
		const context = changing({
			...memory,
			tokens: {
				...memory.tokens,
				async insertToken(record) {
					if (down && record.kind === 'changeEmail') {
						throw new Error('connect ECONNREFUSED');
					}
					return memory.tokens.insertToken(record);
				},
			},
		});
		const user = await verifiedAda(context);
		down = true;

		const error = await rejection(
			context.auth.changeEmail.send(user, NEW_EMAIL),
		);

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({ code: 'STORE_FAILED' });
	});

	it('confirm is STORE_FAILED when the write cannot land, and reports nothing', async () => {
		const memory = createMemoryStores();
		let down = false;
		const context = changing({
			...memory,
			users: {
				...memory.users,
				async updateUser(...args) {
					if (down) throw new Error('connect ECONNREFUSED');
					return memory.users.updateUser(...args);
				},
			},
		});
		const user = await verifiedAda(context);
		const sent = await context.auth.changeEmail.send(user, NEW_EMAIL);
		const before = context.received.length;
		down = true;

		const error = await rejection(context.auth.changeEmail.confirm(sent.token));

		expect(error).toMatchObject({ code: 'STORE_FAILED' });
		expect(context.received.length).toBe(before);
		down = false;
		expect((await context.auth.get(user.id)).email).not.toBe(NEW_EMAIL);
	});
});
