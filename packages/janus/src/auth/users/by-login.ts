import { isStorable } from '../../stores/storable';
import type { ResolvedType } from '../config';
import type { Context } from '../context';
import type { UserRecord } from '../port/types';

/**
 * The user holding this normalised login, or `null`. A login no store can
 * keep is nobody's: answered as an absence, without asking a store that
 * would fail on it.
 */
export const byLogin = async (
	context: Context,
	type: ResolvedType,
	login: string,
): Promise<UserRecord | null> =>
	isStorable(login)
		? context.store.users.findUserByLogin(type.name, login)
		: null;
