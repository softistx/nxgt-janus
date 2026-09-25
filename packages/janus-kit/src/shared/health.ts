/** What one round trip found. It never throws: a health check reports. */
export type PingResult =
	| { readonly ok: true; readonly latencyMs: number }
	| { readonly ok: false; readonly error: unknown };

/**
 * The database, under its own name — `postgres`, `mongo` — and `redis` when
 * it is wired; `ok` when every one answered.
 */
export type HealthOf<Database extends string> = {
	readonly ok: boolean;
	readonly redis?: PingResult;
} & { readonly [Name in Database]: PingResult };

export type Probe = (timeoutMs: number) => Promise<PingResult>;

/** The database's probe under its own name, and Redis's when it is wired. */
export type Probes<Database extends string> = {
	readonly [Name in Database]: Probe;
} & { readonly redis?: Probe };

/** Every probe at once, each within `timeoutMs`. */
export async function probe<Database extends string>(
	probes: Probes<Database>,
	timeoutMs: number,
): Promise<HealthOf<Database>> {
	const entries = await Promise.all(
		(Object.entries(probes) as [string, Probe][]).map(
			async ([name, run]) => [name, await run(timeoutMs)] as const,
		),
	);
	const results = Object.fromEntries(entries) as Record<string, PingResult>;
	return {
		ok: entries.every(([, result]) => result.ok),
		...results,
	} as HealthOf<Database>;
}

/**
 * `run`, answered within `timeoutMs`, as `ping` reports it: a round trip that
 * throws or takes longer is `{ ok: false, error }`.
 */
export async function timed(
	run: () => Promise<unknown>,
	timeoutMs: number,
): Promise<PingResult> {
	const started = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			run(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`ping: no answer in ${timeoutMs}ms`)),
					timeoutMs,
				);
			}),
		]);
		return { ok: true, latencyMs: performance.now() - started };
	} catch (error) {
		return { ok: false, error };
	} finally {
		clearTimeout(timer);
	}
}
