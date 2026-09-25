/** What one round trip found. It never throws: a health check reports. */
export type PingResult =
	| { readonly ok: true; readonly latencyMs: number }
	| { readonly ok: false; readonly error: unknown };

/** `postgres`, and `redis` when it is wired; `ok` when every one answered. */
export interface Health {
	readonly ok: boolean;
	readonly postgres: PingResult;
	readonly redis?: PingResult;
}

export type Probe = (timeoutMs: number) => Promise<PingResult>;

/** Every probe at once, each within `timeoutMs`. */
export async function probe(
	probes: Record<string, Probe>,
	timeoutMs: number,
): Promise<Health> {
	const entries = await Promise.all(
		Object.entries(probes).map(
			async ([name, run]) => [name, await run(timeoutMs)] as const,
		),
	);
	const results = Object.fromEntries(entries) as Record<string, PingResult>;
	return {
		ok: entries.every(([, result]) => result.ok),
		...results,
	} as Health;
}
