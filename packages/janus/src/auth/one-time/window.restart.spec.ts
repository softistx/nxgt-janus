import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { fixedClock } from '../../time/clock';
import type { Context } from '../context';
import { createMemoryStores } from '../port/memory';
import type { TokenStore } from '../port/types';
import { type AttemptWindow, countInWindow } from './window';

const WINDOW_MS = 15 * 60_000;
const hashOf = (link: number) => `link-${link}`;
const vanished = new Error('vanished');

/** What countInWindow reads of a context: the tokens store and the clock. */
function contextOver(tokens: TokenStore): Context {
	const clock = fixedClock(Date.UTC(2026, 8, 23));
	return { store: { tokens }, clock } as unknown as Context;
}

const restarting: AttemptWindow = {
	windowMs: WINDOW_MS,
	spent: 'restart',
	userId: 'login-key',
	linkHash: (_window, link) => hashOf(link),
	vanished: () => vanished,
};

/** Stores `links`, spending those `spent` names, as sign-ins leave them. */
async function stored(
	tokens: TokenStore,
	links: readonly number[],
	spent: readonly number[],
): Promise<void> {
	for (const link of links) {
		await tokens.insertToken({
			tokenHash: hashOf(link),
			kind: 'secondFactor',
			userId: 'login-key',
			address: '',
			codeHash: null,
			attempts: 7,
			expiresAt: new Date(Date.UTC(2026, 8, 24)),
			spentAt: null,
			createdAt: new Date(Date.UTC(2026, 8, 23)),
		});
		if (spent.includes(link)) {
			await tokens.consumeToken(hashOf(link), 'secondFactor', new Date());
		}
	}
}

describe('countInWindow, restarting', () => {
	it('carries on past a link a racing sign-in spent between the probe and the insert', async () => {
		const { tokens } = createMemoryStores();
		const racing: TokenStore = {
			...tokens,
			insertToken: async (record) => {
				await tokens.insertToken(record);
				// Another sign-in inserted it first, and succeeded.
				if (record.tokenHash === hashOf(0)) {
					await tokens.consumeToken(
						record.tokenHash,
						'secondFactor',
						new Date(),
					);
				}
			},
		};

		const counted = await countInWindow(contextOver(racing), restarting);

		expect(counted).toMatchObject({ attempts: 1, link: hashOf(1) });
	});

	it('starts again at a link the store lost from the middle of the chain, without failing', async () => {
		const { tokens } = createMemoryStores();
		// Link 2 evicted: 0, 1 and 3 spent, 4 counting.
		await stored(tokens, [0, 1, 3, 4], [0, 1, 3]);

		const counted = await countInWindow(contextOver(tokens), restarting);

		expect(counted).toMatchObject({ attempts: 1, link: hashOf(2) });
	});

	it('finds the one unspent link past many spent ones', async () => {
		const { tokens } = createMemoryStores();
		const links = Array.from({ length: 41 }, (_, link) => link);
		await stored(tokens, links, links.slice(0, 40));

		const counted = await countInWindow(contextOver(tokens), restarting);

		expect(counted).toMatchObject({ attempts: 8, link: hashOf(40) });
	});

	it('fails closed on a store that answers every link as spent', async () => {
		const { tokens } = createMemoryStores();
		const endless: TokenStore = {
			...tokens,
			countAttempt: async (hash) => ({
				tokenHash: hash,
				kind: 'secondFactor',
				userId: 'login-key',
				address: '',
				codeHash: null,
				attempts: 1,
				expiresAt: new Date(Date.UTC(2026, 8, 24)),
				spentAt: new Date(Date.UTC(2026, 8, 23)),
				createdAt: new Date(Date.UTC(2026, 8, 23)),
			}),
		};

		expect(
			await rejection(countInWindow(contextOver(endless), restarting)),
		).toBe(vanished);
	});
});
