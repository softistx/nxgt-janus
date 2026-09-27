/**
 * What every operation of the core is handed: the resolved configuration, the
 * guarded stores, the clock, the hashers and the events listener.
 */

import { mintId } from '../../ids/id';
import type { RelationStore } from '../../permissions/port/types';
import type { Clock } from '../../time/clock';
import type { PasswordHasher, ResolvedConfig } from '../config';
import type { UserEventListener } from '../events';
import type { JanusStores, StoreCapabilities } from '../port/types';

export interface Context {
	readonly config: ResolvedConfig;
	/** Already guarded, by `src/stores/guard.ts`. */
	readonly store: JanusStores;
	/** Already guarded. `null` when no relation store is wired. */
	readonly relations: RelationStore | null;
	readonly capabilities: StoreCapabilities;
	readonly clock: Clock;
	readonly hasher: PasswordHasher | null;
	/** The hasher first, then every verifier: whoever claims a prefix verifies it. */
	readonly verifiers: readonly PasswordHasher[];
	/** Hashed once, lazily: what a missing user's password is compared against. */
	dummyHash(): Promise<string>;
	/** What `janus({ events })` was given, or `null`. */
	readonly events: UserEventListener | null;
}

export function createContext(
	config: ResolvedConfig,
	store: JanusStores,
	relations: RelationStore | null,
	capabilities: StoreCapabilities,
	clock: Clock,
	hasher: PasswordHasher | null,
	verifiers: readonly PasswordHasher[],
	events: UserEventListener | null = null,
): Context {
	let dummy: Promise<string> | null = null;

	return {
		config,
		store,
		relations,
		capabilities,
		clock,
		hasher,
		verifiers,
		events,
		dummyHash: () => {
			if (hasher === null) {
				throw new TypeError('janus: no hasher to compare a dummy hash with');
			}
			dummy ??= hasher.hash(`janus-dummy-${mintId()}`);
			return dummy;
		},
	};
}
