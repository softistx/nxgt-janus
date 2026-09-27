/** What `permissions()` answers, typed from the model it was given. */

import type { Can } from './can';
import type { ModelConfig } from './config';
import type { PermissionModel } from './define';
import type { Grant } from './grant';
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
}
