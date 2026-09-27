import type { TokenRecord, TokenStore } from '../types';
import { copy } from './copy';

/** The token store in memory, by token hash. */
export function memoryTokenStore(): TokenStore {
	const byTokenHash = new Map<string, TokenRecord>();

	return {
		async insertToken(record) {
			if (byTokenHash.has(record.tokenHash)) return;
			byTokenHash.set(record.tokenHash, copy(record));
		},

		async consumeToken(tokenHash, kind, at) {
			// No `await` between this read and the write below: on one event loop
			// that is what makes the pair a single conditional write.
			const stored = byTokenHash.get(tokenHash);
			if (stored === undefined || stored.kind !== kind) return null;

			const before = copy(stored);
			if (stored.spentAt === null) {
				byTokenHash.set(tokenHash, { ...stored, spentAt: new Date(at) });
			}

			return before;
		},

		async countAttempt(tokenHash, kind) {
			// The same single conditional write as consumeToken: no `await`
			// between the read and the write.
			const stored = byTokenHash.get(tokenHash);
			if (stored === undefined || stored.kind !== kind) return null;
			if (stored.spentAt !== null) return copy(stored);

			const counted = { ...stored, attempts: stored.attempts + 1 };
			byTokenHash.set(tokenHash, counted);
			return copy(counted);
		},

		async spendUserTokens(userId, kind, at, except) {
			let spent = 0;

			for (const [tokenHash, stored] of byTokenHash) {
				if (
					tokenHash !== except &&
					stored.userId === userId &&
					stored.kind === kind &&
					stored.spentAt === null
				) {
					byTokenHash.set(tokenHash, { ...stored, spentAt: new Date(at) });
					spent += 1;
				}
			}

			return spent;
		},

		async deleteUserTokens(userId) {
			let deleted = 0;

			for (const [tokenHash, stored] of byTokenHash) {
				if (stored.userId === userId) {
					byTokenHash.delete(tokenHash);
					deleted += 1;
				}
			}

			return deleted;
		},
	};
}
