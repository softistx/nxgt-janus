/** What `permissions()` answers, typed from the model it was given. */

import type { Can } from './can';
import type { ModelConfig } from './config';
import type { PermissionModel } from './define';
import type { Grant, Replace } from './grant';
import type { List } from './list';

/** What `permissions()` answers. */
export interface Permissions<C extends ModelConfig> {
	readonly model: PermissionModel<C>;
	/**
	 * Whether `subject` holds `permission` on `object`: `true` or `false`, and
	 * **a failure throws** — a store that cannot answer is `STORE_FAILED`, never
	 * a denial. `null` is anonymous, and `false` before any store call.
	 */
	readonly can: Can<C>;
	/**
	 * The ids of the objects of `type` on which `subject` holds `permission`,
	 * ascending, by pages — what `can()` answers `true` for, found without
	 * naming them. `null` is anonymous, and an empty page before any store call.
	 * A failure throws, as for `can()`.
	 */
	readonly list: List<C>;
	/** Stores that `subject` holds `relation` on `object`. Idempotent. */
	readonly grant: Grant<C>;
	/** Removes it. Idempotent: revoking what is not held is not an error. */
	readonly revoke: Grant<C>;
	/**
	 * Makes `subjects` the only holders of `relation` on `object`: adds the
	 * missing, removes the others, in one write (none when nothing changes), and
	 * answers `{ added, removed }`. `[]` removes every holder; duplicates count
	 * once; a subject set is not its entity. Every subject is checked first, as
	 * `grant()` checks it, so a refusal writes nothing.
	 *
	 * **Not serialised**: two concurrent calls on the same object and relation
	 * each read, then write their diff, so the result can hold the union of both
	 * adds. A caller that needs one winner serialises them itself.
	 */
	readonly replace: Replace<C>;
}
