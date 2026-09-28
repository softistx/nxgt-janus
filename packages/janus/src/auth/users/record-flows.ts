import { isId } from '../../ids/id';
import { invalidCursor, pageLimit } from '../../pagination/cursor-page';
import type { At } from '../at';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	findRecord,
	getRecord,
	toUser,
	writeUser,
} from '../context';
import type { UserTypeApi } from '../types';
import { deleteUser } from './delete';
import type { Input } from './flow-types';
import { insert } from './insert';
import { update } from './update';

/**
 * The flows every user type has, whatever its configuration: creating,
 * reading, listing, updating, deactivating and deleting its users.
 */
export function recordFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): UserTypeApi<AnyUser, Input> {
	const { store } = context;

	return {
		async create(input) {
			return toUser(await insert(context, type, input as Input, at('create')));
		},

		async find(id) {
			const record = await findRecord(context, id, type.name);
			return record === null ? null : toUser(record);
		},

		async get(id) {
			return toUser(await getRecord(context, id, type.name, at('get')));
		},

		async list(page) {
			const after = page?.after ?? null;
			// Never a silent first page: a caller paging a list would loop for
			// ever, and the loop would look like a slow query.
			if (after !== null && !isId(after)) {
				throw invalidCursor(at('list'), after);
			}

			const answer = await store.users.listUsers({
				type: type.name,
				after,
				limit: pageLimit(page?.limit, at('list')),
			});
			return { items: answer.items.map(toUser), nextCursor: answer.nextCursor };
		},

		async update(user, patch, options) {
			return toUser(
				await update(
					context,
					type,
					user,
					patch as Input,
					options,
					at('update'),
				),
			);
		},

		async setActive(user, active, options) {
			return toUser(
				await writeUser(context, user, type, options, at('setActive'), () => ({
					active: active === true,
				})),
			);
		},

		async delete(user) {
			return deleteUser(context, type, user);
		},
	};
}
