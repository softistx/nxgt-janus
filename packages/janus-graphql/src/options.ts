/**
 * The wiring checks `useJanus()` and `janusConnection()` share: what each
 * refuses at start-up, with a `TypeError` naming the call that was written.
 */

/** What both calls take and check before anything runs. */
export interface Wiring {
	readonly auth: unknown;
	readonly access?: unknown;
	readonly clock?: unknown;
}

/**
 * Refuses an `auth` that is not what `janus()` answered, an `access` that
 * is not what `permissions()` answered, and a `clock` that is not a
 * `Clock` — each a `TypeError` naming `caller`.
 */
export function checkWiring(caller: string, { auth, access, clock }: Wiring) {
	if (
		typeof (auth as { readonly authenticate?: unknown } | null)
			?.authenticate !== 'function'
	) {
		throw new TypeError(
			`${caller}: auth is not what janus() answered — pass { auth }`,
		);
	}
	if (
		access !== undefined &&
		typeof (access as { readonly can?: unknown } | null)?.can !== 'function'
	) {
		throw new TypeError(
			`${caller}: access is not what permissions() answered — pass { auth, access }`,
		);
	}
	if (
		clock !== undefined &&
		typeof (clock as { readonly now?: unknown } | null)?.now !== 'function'
	) {
		throw new TypeError(
			`${caller}: clock is not a Clock — pass the clock given to janus(), or leave it out for the system clock`,
		);
	}
}
