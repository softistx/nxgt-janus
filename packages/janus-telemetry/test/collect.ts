import {
	createTelemetry,
	type LogRecord,
	type Signal,
	type SpanRecord,
	withTelemetry,
} from '@nxgt/telemetry';

/**
 * Runs `work` under a telemetry of its own and answers every signal it wrote,
 * once flushed — the way `@nxgt/telemetry` says to test with it.
 */
export async function collect(work: () => Promise<unknown>): Promise<{
	readonly spans: readonly SpanRecord[];
	readonly logs: readonly LogRecord[];
	readonly all: readonly Signal[];
}> {
	const received: Signal[] = [];
	const telemetry = createTelemetry('test', {
		exporters: [{ export: (_resource, batch) => void received.push(...batch) }],
		minimum: 'debug',
	});
	await withTelemetry(telemetry, work);
	await telemetry.close();
	return {
		spans: received.filter(
			(signal): signal is SpanRecord => signal.type === 'span',
		),
		logs: received.filter(
			(signal): signal is LogRecord => signal.type === 'log',
		),
		all: received,
	};
}

/** Settles a rejection where it is created. */
export const rejection = (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => undefined,
		(error: unknown) => error,
	);
