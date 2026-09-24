/**
 * The suite's five assertions.
 *
 * **No assertion library, no test framework**: `bun:test` in the dependency
 * graph of a published library is a dependency every consumer installs, and an
 * adapter author on vitest could not run the suite at all. Each throws a plain
 * `Error` whose message names the port method and what it should have answered
 * — the sentence an adapter author reads first.
 */

/** Fails unless `actual` deep-equals `expected`: dates by instant, `1` never `'1'`. */
export function equal(actual: unknown, expected: unknown, what: string): void {
	const difference = differ(actual, expected, '');
	if (difference !== null) {
		throw new Error(
			`${what}\n  at ${difference.path || '(root)'}: expected ${show(difference.expected)}, got ${show(difference.actual)}`,
		);
	}
}

/** Fails unless `actual` is `null` — not `undefined`, which is a store that forgot to answer. */
export function isNull(actual: unknown, what: string): void {
	if (actual !== null) {
		throw new Error(
			`${what}\n  expected null, got ${actual === undefined ? 'undefined — an absence is null; undefined is a store that forgot to answer' : show(actual)}`,
		);
	}
}

/** Fails unless `condition` holds. */
export function ok(condition: boolean, what: string): void {
	if (!condition) throw new Error(what);
}

/**
 * The rejection of `promise`, or a failure when it resolves.
 *
 * **Settled where it is created**, with `.then(ok, ko)`: a rejection awaited
 * too late is counted unhandled by Bun and fails the case with the very error
 * it was checking — measured in nxgt-data, where a loaded CI runner failed
 * where an idle laptop passed.
 */
export function rejects(
	promise: Promise<unknown>,
	what: string,
): Promise<unknown> {
	return promise.then(
		(answer) => {
			throw new Error(`${what}\n  expected a rejection, got ${show(answer)}`);
		},
		(error: unknown) => error,
	);
}

/**
 * The `instanceof` probe: a class that is named like this package's but is not
 * this package's class means **two copies of `@nxgt/janus`** are installed —
 * the adapter depends on it instead of peering it. Then `StoreConflict` stops
 * passing through the core, and an identifier that is taken is answered as an
 * outage.
 *
 * The probe says what breaks; `verify:artifacts` says whether a duplicate is
 * present. Both are needed.
 */
export function isOurs<T>(
	error: unknown,
	cls: abstract new (...args: never[]) => T,
	what: string,
): asserts error is T {
	if (error instanceof cls) return;

	// Same name, not the same class: the duplicate the probe exists for.
	if ((error as { name?: unknown } | null)?.name === cls.name) {
		throw new Error(
			`${what}\n  the error is named ${cls.name} but is not @nxgt/janus's ${cls.name}: two copies of @nxgt/janus are installed. The adapter must list it as a peer dependency, never a dependency`,
		);
	}

	throw new Error(`${what}\n  expected ${cls.name}, got ${show(error)}`);
}

interface Difference {
	readonly path: string;
	readonly expected: unknown;
	readonly actual: unknown;
}

function differ(
	actual: unknown,
	expected: unknown,
	path: string,
): Difference | null {
	if (expected instanceof Date || actual instanceof Date) {
		return actual instanceof Date &&
			expected instanceof Date &&
			actual.getTime() === expected.getTime()
			? null
			: { path, expected, actual };
	}

	if (Array.isArray(expected) || Array.isArray(actual)) {
		if (!Array.isArray(expected) || !Array.isArray(actual)) {
			return { path, expected, actual };
		}
		if (expected.length !== actual.length) {
			return {
				path: `${path}.length`,
				expected: expected.length,
				actual: actual.length,
			};
		}
		for (let i = 0; i < expected.length; i += 1) {
			const inner = differ(actual[i], expected[i], `${path}[${i}]`);
			if (inner !== null) return inner;
		}
		return null;
	}

	if (
		typeof expected === 'object' &&
		expected !== null &&
		typeof actual === 'object' &&
		actual !== null
	) {
		const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
		for (const key of keys) {
			const inner = differ(
				(actual as Record<string, unknown>)[key],
				(expected as Record<string, unknown>)[key],
				path === '' ? key : `${path}.${key}`,
			);
			if (inner !== null) return inner;
		}
		return null;
	}

	return Object.is(actual, expected) ? null : { path, expected, actual };
}

function show(value: unknown): string {
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	if (value instanceof Date) return value.toISOString();
	if (value === undefined) return 'undefined';
	if (typeof value === 'string') return JSON.stringify(value);
	try {
		const json = JSON.stringify(value);
		return json.length > 200 ? `${json.slice(0, 200)}…` : json;
	} catch {
		return String(value);
	}
}
