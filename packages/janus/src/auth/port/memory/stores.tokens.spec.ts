import { describe, expect, it } from 'bun:test';
import { createMemoryStores } from './stores';
import { at, token } from './stores.fixtures';

// These specs pin the reference store's own behaviour. The conformance suite,
// in `src/conformance/`, is what asks the same questions of every adapter; these
// stay because the store is shipped, and a consumer's tests rely on it.

describe('tokens', () => {
	it('lets exactly one of twenty concurrent redemptions spend a token', async () => {
		// A reset token two requests both redeem is an account takeover.
		const { tokens } = createMemoryStores();
		const record = token();
		await tokens.insertToken(record);

		const answers = await Promise.all(
			Array.from({ length: 20 }, () =>
				tokens.consumeToken(record.tokenHash, 'resetPassword', at(2)),
			),
		);

		expect(
			answers.filter((a) => a !== null && a.spentAt === null),
		).toHaveLength(1);
		expect(answers.filter((a) => a?.spentAt !== null)).toHaveLength(19);
	});

	it('answers the token as it was before the call', async () => {
		const { tokens } = createMemoryStores();
		const record = token();
		await tokens.insertToken(record);

		expect(
			await tokens.consumeToken(record.tokenHash, 'resetPassword', at(2)),
		).toEqual(record);
		expect(
			(await tokens.consumeToken(record.tokenHash, 'resetPassword', at(3)))
				?.spentAt,
		).toEqual(at(2));
	});

	it('spends a lapsed token all the same: expiry is compared by the core', async () => {
		const { tokens } = createMemoryStores();
		const record = token({ expiresAt: at(1) });
		await tokens.insertToken(record);

		expect(
			(await tokens.consumeToken(record.tokenHash, 'resetPassword', at(5)))
				?.spentAt,
		).toBeNull();
		expect(
			(await tokens.consumeToken(record.tokenHash, 'resetPassword', at(6)))
				?.spentAt,
		).toEqual(at(5));
	});

	it('does not know, and does not spend, a token of the other kind', async () => {
		const { tokens } = createMemoryStores();
		const record = token({ kind: 'verifyEmail' });
		await tokens.insertToken(record);

		expect(
			await tokens.consumeToken(record.tokenHash, 'resetPassword', at(2)),
		).toBeNull();
		expect(
			(await tokens.consumeToken(record.tokenHash, 'verifyEmail', at(3)))
				?.spentAt,
		).toBeNull();
		expect(
			await tokens.consumeToken('unknown', 'resetPassword', at(3)),
		).toBeNull();
	});
});
