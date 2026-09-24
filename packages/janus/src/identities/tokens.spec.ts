import { describe, expect, it } from 'bun:test';
import { ada, rejection, setup } from '../../test/identities';
import { NotFoundError, type TokenError } from '../errors/janus-error';
import { createMemoryStores } from './port/memory';
import type { SessionRecord } from './port/types';

const MINUTE = 60_000;

describe('verification tokens', () => {
	it('verifies the address the token was sent to, both fields together', async () => {
		const { identities, clock } = setup();
		const identity = await identities.create({ traits: ada });
		const { secret } = await identities.tokens.issue(
			'verification',
			identity.id,
			ada.email,
		);

		const verified = await identities.tokens.consumeVerification(secret);

		expect(verified.addresses[0]).toMatchObject({
			value: ada.email,
			verified: true,
			verifiedAt: clock.now(),
		});
	});

	it('refuses an address the identity does not hold', async () => {
		const { identities } = setup();
		const identity = await identities.create({ traits: ada });

		const error = await rejection(
			identities.tokens.issue('verification', identity.id, 'else@x.test'),
		);

		expect(error).toBeInstanceOf(NotFoundError);
	});
});

describe('recovery tokens', () => {
	it('answers the identity and opens no session', async () => {
		// The counter wraps the store BEFORE createIdentities: the core captures
		// each method when it guards the stores, so a patch made afterwards would
		// count nothing and this spec would pass whatever the core did.
		let sessionsOpened = 0;
		const stores = createMemoryStores();
		const insert = stores.sessions.insertSession;
		const counting = {
			...stores,
			sessions: {
				...stores.sessions,
				insertSession: (record: SessionRecord) => {
					sessionsOpened += 1;
					return insert(record);
				},
			},
		};
		const { identities } = setup({ stores: counting });
		const identity = await identities.create({ traits: ada });
		const { secret } = await identities.tokens.issue(
			'recovery',
			identity.id,
			ada.email,
		);

		expect((await identities.tokens.consumeRecovery(secret)).id).toBe(
			identity.id,
		);
		expect(sessionsOpened).toBe(0);

		// The counter counts: a session opened through the core is seen.
		await identities.sessions.create(identity.id);
		expect(sessionsOpened).toBe(1);
	});

	it('is single use: the second redemption is TOKEN_SPENT', async () => {
		const { identities } = setup();
		const identity = await identities.create({ traits: ada });
		const { secret } = await identities.tokens.issue(
			'recovery',
			identity.id,
			ada.email,
		);

		await identities.tokens.consumeRecovery(secret);
		const error = await rejection(identities.tokens.consumeRecovery(secret));

		expect((error as TokenError).code).toBe('TOKEN_SPENT');
	});

	it('lets one of twenty concurrent redemptions through', async () => {
		const { identities } = setup();
		const identity = await identities.create({ traits: ada });
		const { secret } = await identities.tokens.issue(
			'recovery',
			identity.id,
			ada.email,
		);

		const outcomes = await Promise.allSettled(
			Array.from({ length: 20 }, () =>
				identities.tokens.consumeRecovery(secret),
			),
		);

		expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
	});

	it('spends a lapsed token and says TOKEN_EXPIRED, then TOKEN_SPENT', async () => {
		const { identities, clock } = setup();
		const identity = await identities.create({ traits: ada });
		const { secret } = await identities.tokens.issue(
			'recovery',
			identity.id,
			ada.email,
		);
		clock.advance(15 * MINUTE);

		const first = await rejection(identities.tokens.consumeRecovery(secret));
		const second = await rejection(identities.tokens.consumeRecovery(secret));

		expect((first as TokenError).code).toBe('TOKEN_EXPIRED');
		expect((second as TokenError).code).toBe('TOKEN_SPENT');
	});

	it('does not redeem a verification token as recovery, nor an unknown one', async () => {
		const { identities } = setup();
		const identity = await identities.create({ traits: ada });
		const { secret } = await identities.tokens.issue(
			'verification',
			identity.id,
			ada.email,
		);

		const crossed = await rejection(identities.tokens.consumeRecovery(secret));
		const unknown = await rejection(
			identities.tokens.consumeRecovery('not-a-token'),
		);

		expect((crossed as TokenError).code).toBe('TOKEN_UNKNOWN');
		expect((unknown as TokenError).code).toBe('TOKEN_UNKNOWN');
		// Not spent by the crossed attempt.
		expect(
			(await identities.tokens.consumeVerification(secret)).addresses[0]
				?.verified,
		).toBe(true);
	});

	it('names no secret in any refusal', async () => {
		const { identities } = setup();
		const secret = 'sentinel-token-secret';

		const error = await rejection(identities.tokens.consumeRecovery(secret));

		expect((error as Error).message).not.toContain(secret);
		expect(JSON.stringify(error)).not.toContain(secret);
	});
});
