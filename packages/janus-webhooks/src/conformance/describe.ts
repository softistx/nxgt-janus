import type { ConformanceRunner } from '@nxgt/janus/conformance';
import { leaseCases } from './cases/lease';
import { orphanCases } from './cases/orphans';
import { webhookQueueOutageCases } from './cases/outage';
import { queueCases } from './cases/queue';
import type { WebhookQueueCase, WebhookQueueHarness } from './types';

/** Every case but the outages: what a queue must do when it answers. */
export const webhookQueueCases: readonly WebhookQueueCase[] = [
	...queueCases,
	...leaseCases,
	...orphanCases,
];

/** Every case, in the order they are described. */
export const allWebhookQueueCases: readonly WebhookQueueCase[] = [
	...webhookQueueCases,
	...webhookQueueOutageCases,
];

/** Why a case did not run. A skip is always reported with its reason, never silent. */
export const SKIP_REASONS = {
	faults:
		'faults not provided: the outage invariant is not proven for this adapter',
} as const;

/**
 * Runs one case against a freshly opened queue, and closes it, pass or fail.
 * Answers the reason when the case cannot run on this queue.
 *
 * The runner-less layer: a loop over `allWebhookQueueCases` calling this is a
 * conformance run with no test framework at all.
 */
export async function runWebhookQueueCase(
	queueCase: WebhookQueueCase,
	harness: WebhookQueueHarness,
): Promise<{ readonly skipped: string } | { readonly passed: true }> {
	const opened = await harness.open();

	try {
		if (queueCase.needs === 'faults' && opened.faults === undefined) {
			return { skipped: SKIP_REASONS.faults };
		}
		await queueCase.run({
			queue: opened.queue,
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
 * describeWebhookQueues({ name: 'my queue', harness, runner: { describe, it } });
 * ```
 *
 * `runner` may be left out under jest, or vitest with `globals: true`: the
 * suite then reads `describe` and `it` from `globalThis`. **Not under `bun
 * test`**, which gives a test file `describe` and `it` as bare identifiers,
 * and not as properties of `globalThis` — so pass them.
 */
export function describeWebhookQueues(options: {
	readonly name: string;
	readonly harness: WebhookQueueHarness;
	readonly runner?: ConformanceRunner;
	/** Case ids to skip, each with the reason — reported, never silent. */
	readonly skip?: Readonly<Record<string, string>>;
	/** Declared up front, so the report can say so before the first case runs. */
	readonly faults?: boolean;
}): void {
	describeSuite({
		title: `${options.name} — @nxgt/janus-webhooks queue conformance`,
		cases: allWebhookQueueCases,
		run: (queueCase) => runWebhookQueueCase(queueCase, options.harness),
		runner: options.runner ?? fromGlobals('describeWebhookQueues'),
		skip: options.skip ?? {},
		faults: options.faults,
	});
}

// ─── A copy of @nxgt/janus/conformance's, which does not export them ──────
// Recorded in the root AGENTS.md, "Deliberate duplications": change one,
// change both.

/** What any suite's case declares, as far as describing it goes. */
interface DescribedCase {
	readonly id: string;
	readonly group: string;
	readonly name: string;
	readonly needs?: string | readonly string[];
}

/**
 * Describes one suite's cases, grouped, under a runner, so a skip, an
 * unproven outage and a missing runner read the same as in `@nxgt/janus`'s
 * suites.
 */
function describeSuite<C extends DescribedCase>(options: {
	readonly title: string;
	readonly cases: readonly C[];
	readonly run: (
		conformanceCase: C,
	) => Promise<{ readonly skipped: string } | { readonly passed: true }>;
	readonly runner: ConformanceRunner;
	readonly skip: Readonly<Record<string, string>>;
	readonly faults: boolean | undefined;
}): void {
	const { runner, skip, cases } = options;
	const groups = [...new Set(cases.map((c) => c.group))];

	const title =
		options.faults === false
			? `${options.title} (WITHOUT faults: ${SKIP_REASONS.faults})`
			: options.title;

	runner.describe(title, () => {
		for (const group of groups) {
			runner.describe(group, () => {
				for (const conformanceCase of cases.filter((c) => c.group === group)) {
					const reason = skip[conformanceCase.id];
					if (reason !== undefined) {
						runner.it.skip(
							`${conformanceCase.name} — skipped: ${reason}`,
							async () => {},
						);
						continue;
					}
					if (
						[conformanceCase.needs].flat().includes('faults') &&
						options.faults === false
					) {
						runner.it.skip(
							`${conformanceCase.name} — skipped: ${SKIP_REASONS.faults}`,
							async () => {},
						);
						continue;
					}

					runner.it(conformanceCase.name, async () => {
						const outcome = await options.run(conformanceCase);
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

function fromGlobals(where: string): ConformanceRunner {
	const globals = globalThis as {
		describe?: ConformanceRunner['describe'];
		it?: ConformanceRunner['it'];
	};

	if (
		typeof globals.describe !== 'function' ||
		typeof globals.it !== 'function'
	) {
		throw new TypeError(
			`${where}: no test runner on globalThis — pass runner: { describe, it } (under bun test: import them from 'bun:test')`,
		);
	}

	return { describe: globals.describe, it: globals.it };
}
