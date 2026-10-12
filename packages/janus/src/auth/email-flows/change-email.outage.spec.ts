import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, person } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
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

	it('update reports the e-mail it wrote when spending the change links fails', async () => {
		const memory = createMemoryStores();
		let down = false;
		const context = changing({
			...memory,
			tokens: {
				...memory.tokens,
				async spendUserTokens(...args) {
					if (down) throw new Error('connect ECONNREFUSED');
					return memory.tokens.spendUserTokens(...args);
				},
			},
		});
		const user = await verifiedAda(context);
		down = true;

		const error = await rejection(
			context.auth.update(user, { email: NEW_EMAIL }),
		);

		expect(error).toMatchObject({ code: 'STORE_FAILED' });
		down = false;
		expect((await context.auth.get(user.id)).email).toBe(NEW_EMAIL);
		expect(context.types()).toContain('user.emailChanged');
	});

	it('send is a wiring TypeError when the schema strips the e-mail field', async () => {
		let strip = false;
		const stripping = person.transform((fields) =>
			strip ? { name: fields.name } : fields,
		);
		const auth = janus({
			user: stripping,
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher,
			clock: fixedClock(Date.UTC(2026, 8, 26)),
		});
		const { user } = await auth.signUp({ ...ada, password });
		strip = true;

		const error = await rejection(auth.changeEmail.send(user, NEW_EMAIL));

		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toContain('did not name a string');
	});
});
