import { hasher, person } from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores, TokenKind } from '../port/types';

export function setupPrepared(mail?: { throttle: { attempts: number } }) {
	const memory = createMemoryStores();
	const issued: TokenKind[] = [];
	const sessions: string[] = [];
	const store: JanusStores = {
		...memory,
		tokens: {
			...memory.tokens,
			async insertToken(record) {
				if (record.kind !== 'secondFactor') issued.push(record.kind);
				return memory.tokens.insertToken(record);
			},
		},
		sessions: {
			...memory.sessions,
			async insertSession(record) {
				sessions.push(record.id);
				return memory.sessions.insertSession(record);
			},
		},
	};
	const auth = janus({
		user: person,
		password: { login: 'email', requireVerifiedEmail: true },
		store,
		hasher,
		clock: fixedClock(Date.UTC(2026, 8, 23)),
		...(mail === undefined ? {} : { mail }),
	});
	return { auth, store, issued, sessions };
}
