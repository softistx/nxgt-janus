import type { RelationStore } from '../../permissions/port/types';

/** A method of the relation store. */
export type RelationMethod = keyof RelationStore & string;

/** How the suite makes one relation store method fail, for the outage cases. */
export interface RelationFaults {
	/**
	 * Fails `method`, and only it: the other methods keep answering, because
	 * `outage.write` reads the store back to prove the rejected write changed
	 * nothing.
	 */
	fail(method: RelationMethod): Promise<void>;
}

export interface OpenedRelations {
	/** Empty: every case writes what it reads. */
	readonly store: RelationStore;
	readonly faults?: RelationFaults;
	close?(): Promise<void>;
}

export interface RelationHarness {
	/** Called once per case, so no case sees another's tuples. */
	open(): Promise<OpenedRelations>;
}

export interface RelationContext {
	readonly store: RelationStore;
	readonly faults: RelationFaults | null;
}

export interface RelationCase {
	readonly id: string;
	readonly group: 'relations' | 'outage';
	readonly name: string;
	readonly needs?: 'faults';
	run(context: RelationContext): Promise<void>;
}
