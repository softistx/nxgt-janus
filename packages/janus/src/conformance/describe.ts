import { identityStoreCases } from './cases/identities';
import { outageCases } from './cases/outage';
import { sessionStoreCases } from './cases/sessions';
import { tokenStoreCases } from './cases/tokens';
import type {
	ConformanceCase,
	ConformanceHarness,
	ConformanceRunner,
	OpenedStores,
} from './types';

/** Every case, in the order they are described. */
export const allCases: readonly ConformanceCase[] = [
	...identityStoreCases,
	...sessionStoreCases,
	...tokenStoreCases,
	...outageCases,
];

/** Why a case did not run. A skip is always reported with its reason, never silent. */
export const SKIP_REASONS = {
	faults:
		'faults not provided: the outage invariant is not proven for this adapter',
	deleteExpiredSessions:
		'stores.sessions does not implement the optional deleteExpiredSessions',
} as const;

/**
 * Runs one case against one freshly opened set of stores, and closes them,
 * pass or fail. Answers the reason when the case cannot run on these stores.
 *
 * The runner-less layer: a loop over `allCases` calling this is a conformance
 * run with no test framework at all.
 */
export async function runCase(
	conformanceCase: ConformanceCase,
	harness: ConformanceHarness,
): Promise<{ readonly skipped: string } | { readonly passed: true }> {
	const opened: OpenedStores = await harness.open();

	try {
		if (conformanceCase.needs === 'faults' && opened.faults === undefined) {
			return { skipped: SKIP_REASONS.faults };
		}
		if (
			conformanceCase.needs === 'deleteExpiredSessions' &&
			opened.stores.sessions.deleteExpiredSessions === undefined
		) {
			return { skipped: SKIP_REASONS.deleteExpiredSessions };
		}

		await conformanceCase.run({
			stores: opened.stores,
			faults: opened.faults ?? null,
		});
		return { passed: true };
	} finally {
		await opened.close?.();
	}
}

/**
 * Describes the whole suite under the adapter's test runner.
 *
 * ```ts
 * import { describe, it } from 'bun:test';
 * describeIdentityStores({ name: 'my adapter', harness, runner: { describe, it } });
 * ```
 *
 * `runner` may be left out under jest, or vitest with `globals: true`: the
 * suite then reads `describe` and `it` from `globalThis`. **Not under `bun
 * test`**, measured: Bun gives a test file `describe` and `it` as bare
 * identifiers, and not as properties of `globalThis` — so pass them.
 *
 * Whether a case can run depends on the stores its harness opens, which is only
 * known once they are open. So every case is described as a test; one that
 * cannot run passes **and says so in its name**, and a run without `faults`
 * is written above the suite, where it cannot be scrolled past.
 */
export function describeIdentityStores(options: {
	readonly name: string;
	readonly harness: ConformanceHarness;
	readonly runner?: ConformanceRunner;
	/** Case ids to skip, each with the reason — reported, never silent. */
	readonly skip?: Readonly<Record<string, string>>;
	/** Declared up front, so the report can say so before the first case runs. */
	readonly faults?: boolean;
}): void {
	const runner = options.runner ?? fromGlobals();
	const skip = options.skip ?? {};
	const groups = [...new Set(allCases.map((c) => c.group))];

	const title =
		options.faults === false
			? `${options.name} — @nxgt/janus conformance (WITHOUT faults: ${SKIP_REASONS.faults})`
			: `${options.name} — @nxgt/janus conformance`;

	runner.describe(title, () => {
		for (const group of groups) {
			runner.describe(group, () => {
				for (const conformanceCase of allCases.filter(
					(c) => c.group === group,
				)) {
					const reason = skip[conformanceCase.id];
					if (reason !== undefined) {
						runner.it.skip(
							`${conformanceCase.name} — skipped: ${reason}`,
							async () => {},
						);
						continue;
					}
					if (conformanceCase.needs === 'faults' && options.faults === false) {
						runner.it.skip(
							`${conformanceCase.name} — skipped: ${SKIP_REASONS.faults}`,
							async () => {},
						);
						continue;
					}

					runner.it(conformanceCase.name, async () => {
						const outcome = await runCase(conformanceCase, options.harness);
						if ('skipped' in outcome) {
							process.emitWarning(
								`${conformanceCase.id} skipped: ${outcome.skipped}`,
								{ code: 'JANUS_CONFORMANCE_SKIPPED' },
							);
						}
					});
				}
			});
		}
	});
}

function fromGlobals(): ConformanceRunner {
	const globals = globalThis as {
		describe?: ConformanceRunner['describe'];
		it?: ConformanceRunner['it'];
	};

	if (
		typeof globals.describe !== 'function' ||
		typeof globals.it !== 'function'
	) {
		throw new TypeError(
			"describeIdentityStores: no test runner on globalThis — pass runner: { describe, it } (under bun test: import them from 'bun:test')",
		);
	}

	return { describe: globals.describe, it: globals.it };
}
