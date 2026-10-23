import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

/**
 * A store where the user's e-mail changes **between the two reads** of a
 * redemption: after the token is spent and the user read once, before the
 * write reads them again — the gap a check made only on the first read
 * would miss.
 */
export function changingEmailAfterRedeem(email: string): JanusStores {
	const store = createMemoryStores();
	let reads = -1;
	return {
		...store,
		tokens: {
			...store.tokens,
			async consumeToken(...args) {
				reads = 0;
				return store.tokens.consumeToken(...args);
			},
		},
		users: {
			...store.users,
			async findUser(id) {
				if (reads >= 0 && ++reads === 2) {
					const record = await store.users.findUser(id);
					if (record !== null) {
						await store.users.updateUser(
							id,
							{
								fields: { ...record.fields, email },
								logins: [email],
								updatedAt: record.updatedAt,
							},
							record.version,
						);
					}
				}
				return store.users.findUser(id);
			},
		},
	};
}
