import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { instrumentJanus } from './index';

export const email = 'ada@example.test';
export const password = 'correct horse battery';

/** Two user types, traced, over memory stores whose `findUserByLogin` fails while `outage.on`. */
export function setup() {
	const stores = createMemoryStores();
	const outage = { on: false };
	const find = stores.users.findUserByLogin.bind(stores.users);
	const auth = instrumentJanus(
		janus({
			users: {
				patient: {
					schema: z.strictObject({ email: z.email() }),
					password: { login: 'email' },
				},
				staff: {
					schema: z.strictObject({ username: z.string() }),
					password: { login: 'username' },
				},
			},
			store: {
				...stores,
				users: {
					...stores.users,
					findUserByLogin: (...args) => {
						if (outage.on) throw new Error('connection refused');
						return find(...args);
					},
				},
			},
			hasher: scryptHasher({ cost: 10 }),
		}),
	);
	return { auth, outage };
}
