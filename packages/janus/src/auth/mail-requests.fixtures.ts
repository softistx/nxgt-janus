/**
 * `janus()` with the mail throttle, and a store that counts the one-time
 * tokens it is handed — for the `mail-requests.*.spec.ts` beside this file.
 */

import { ada, hasher, password, person } from '../../test/auth';
import { fixedClock } from '../time/clock';
import type { JanusConfig, MailConfig } from './config';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import type { JanusStores, TokenKind } from './port/types';

/** Ten minutes: the default window. */
export const WINDOW_MS = 10 * 60_000;

/** The message past the limit, for a request that names an address. */
export const byAddress = (where: string) =>
	`${where}: too many e-mails asked for this address — the last one sent still works; use it, or wait for the next window`;

/** The message past the limit, for a request made for a user. */
export const byUser = (where: string) =>
	`${where}: too many e-mails asked for this user — the last one sent still works; use it, or wait for the next window`;

export function mailing(
	options: {
		readonly mail?: MailConfig;
		readonly tokens?: JanusConfig['tokens'];
		readonly store?: JanusStores;
	} = {},
) {
	// Midnight, so the clock sits at the start of a window.
	const clock = fixedClock(Date.UTC(2026, 8, 23));
	const memory = options.store ?? createMemoryStores();
	/** The tokens issued, by kind: the counts themselves are not among them. */
	const issued: TokenKind[] = [];
	const store: JanusStores = {
		...memory,
		tokens: {
			...memory.tokens,
			async insertToken(record) {
				if (record.kind !== 'secondFactor') issued.push(record.kind);
				return memory.tokens.insertToken(record);
			},
		},
	};
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store,
		hasher,
		clock,
		...(options.mail === undefined ? {} : { mail: options.mail }),
		...(options.tokens === undefined ? {} : { tokens: options.tokens }),
	});
	return { auth, store, clock, issued };
}

export type Mailing = ReturnType<typeof mailing>;

/** Signs Ada up, and answers her. */
export async function signedUp({ auth }: Mailing) {
	return (await auth.signUp({ ...ada, password })).user;
}

/** Makes `count` requests one after the other, and answers what each settled to. */
export async function times<T>(
	count: number,
	request: () => Promise<T>,
): Promise<(T | { readonly refused: unknown })[]> {
	const outcomes: (T | { readonly refused: unknown })[] = [];
	for (let at = 0; at < count; at += 1) {
		const [settled] = await Promise.allSettled([request()]);
		outcomes.push(
			settled.status === 'fulfilled'
				? settled.value
				: { refused: (settled.reason as { code?: unknown }).code },
		);
	}
	return outcomes;
}
