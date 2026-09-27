/**
 * What `janus()` answers whatever its user types: authenticating a request,
 * signing out, finding a user by id, the cookie, and collecting expired
 * sessions.
 */

import { UnsupportedError } from '../../errors/janus-error';
import { isId } from '../../ids/id';
import {
	type AnyUser,
	type Context,
	findRecord,
	getRecord,
	idOf,
	toUser,
} from '../context';
import { hashSecret } from '../secrets';
import type { Authenticated, RequestLike, SharedApi } from '../types';
import { authenticate } from './authenticate';
import { cookieOf } from './cookie';
import { presentedToken } from './presented-token';

/** `SharedApi`, degenericised: `janus()` casts it to the typed form once. */
export type InternalSharedApi = Omit<SharedApi<AnyUser>, 'authenticate'> & {
	authenticate(
		request: RequestLike,
		options?: { readonly type?: string },
	): Promise<Authenticated<AnyUser> | null>;
};

/** Everything `janus()` answers whatever its user types. */
export function sharedApi(context: Context): InternalSharedApi {
	const { store, clock, config } = context;

	return {
		async authenticate(request, options) {
			return authenticate(context, request, options);
		},

		async signOut(request) {
			const token = presentedToken(request, config.cookie.name);
			if (token === null) return false;

			const session = await store.sessions.findSessionByTokenHash(
				hashSecret(token),
			);
			if (session === null) return false;
			return store.sessions.revokeSession(session.id, clock.now());
		},

		async signOutEverywhere(user, options) {
			const id = idOf(user);
			if (!isId(id)) return 0;
			// An `except` that is no id this package minted names no session:
			// every session goes, as it would for an unknown one.
			return options?.except === undefined || !isId(options.except)
				? store.sessions.revokeUserSessions(id, clock.now())
				: store.sessions.revokeUserSessions(id, clock.now(), options.except);
		},

		async findUser(id) {
			const record = await findRecord(context, id, null);
			return record === null ? null : toUser(record);
		},

		async getUser(id) {
			return toUser(await getRecord(context, id, null, 'getUser'));
		},

		cookie: cookieOf(context),

		async collectExpired() {
			const collect = store.sessions.deleteExpiredSessions;
			if (!context.capabilities.collectExpired || collect === undefined) {
				throw new UnsupportedError(
					'collectExpired: store.sessions does not implement deleteExpiredSessions — its store expires sessions on its own, or implement the method',
					{ slot: 'sessions', operation: 'deleteExpiredSessions' },
				);
			}
			return collect(clock.now());
		},

		types: [...config.types.keys()],
	};
}
