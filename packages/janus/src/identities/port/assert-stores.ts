import type { IdentityStores, StoreCapabilities } from './types';

/**
 * The methods each slot must answer, in the order the port declares them.
 *
 * Kept beside the interfaces rather than derived from them: a type does not
 * exist at runtime, and this list is the net for the JavaScript caller the
 * compiler never saw.
 */
const REQUIRED = {
	identities: [
		'insertIdentity',
		'findIdentity',
		'findIdentityByIdentifier',
		'listIdentities',
		'updateIdentity',
	],
	sessions: [
		'insertSession',
		'findSessionByTokenHash',
		'extendSession',
		'revokeSession',
		'revokeIdentitySessions',
	],
	tokens: ['insertToken', 'consumeToken'],
} as const satisfies Record<keyof IdentityStores, readonly string[]>;

/**
 * Checks that every slot answers every method the port declares, and reports
 * the optional capabilities found.
 *
 * TypeScript already refuses a partial store and names the missing method;
 * this is the net for a JavaScript caller, and for a store assembled from
 * `any`. A bare `TypeError`, because a missing method can only come from how
 * the application was wired — no request produces one, and no handler should
 * answer one.
 *
 * `where` names the call the consumer wrote — `createIdentities` — so the
 * sentence says which call to fix and which slot to change.
 */
export function assertStores(
	stores: unknown,
	where: string,
): StoreCapabilities {
	if (typeof stores !== 'object' || stores === null) {
		throw new TypeError(
			`${where}: stores must be an object with identities, sessions and tokens`,
		);
	}

	for (const slot of Object.keys(REQUIRED) as (keyof typeof REQUIRED)[]) {
		const store: unknown = (stores as Record<string, unknown>)[slot];

		if (typeof store !== 'object' || store === null) {
			throw new TypeError(`${where}: stores.${slot} is missing`);
		}

		for (const method of REQUIRED[slot]) {
			if (typeof (store as Record<string, unknown>)[method] !== 'function') {
				throw new TypeError(
					`${where}: stores.${slot} has no method ${method}, which the port requires`,
				);
			}
		}
	}

	const sessions = (stores as { sessions: Record<string, unknown> }).sessions;
	const collect = sessions.deleteExpiredSessions;

	// Present but not a function is a wiring mistake, not an absent capability:
	// reporting it as "unsupported" would send the reader to the wrong fix.
	if (collect !== undefined && typeof collect !== 'function') {
		throw new TypeError(
			`${where}: stores.sessions.deleteExpiredSessions must be a function or absent`,
		);
	}

	return { collectExpired: collect !== undefined };
}
