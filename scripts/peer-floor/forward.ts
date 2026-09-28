import { constants } from 'node:os';
import type { Subprocess } from 'bun';

/**
 * SIGINT and SIGTERM, forwarded to the command a floor script runs, so the
 * script outlives it and puts back what it changed. Both floor scripts,
 * `run-on-peer-floor.ts` and `run-in-floor-project.ts`, run their command
 * through this.
 */
export interface Forwarding {
	/**
	 * Runs `command` from `cwd` with inherited stdio; resolves its exit
	 * code, or `128 + <signal>` when one arrived — without spawning at all
	 * if it arrived first.
	 */
	readonly run: (command: readonly string[], cwd: string) => Promise<number>;
	/** Stops listening. Call it in a `finally`. */
	readonly dispose: () => void;
}

export function forwardSignals(): Forwarding {
	let child: Subprocess | undefined;
	let interrupted: NodeJS.Signals | undefined;
	// Named per signal, not read from the listener's argument, which a
	// `process.emit` does not pass.
	const forward = (signal: NodeJS.Signals) => () => {
		interrupted = signal;
		child?.kill(signal);
	};
	const onInt = forward('SIGINT');
	const onTerm = forward('SIGTERM');
	process.on('SIGINT', onInt);
	process.on('SIGTERM', onTerm);
	const interruptedCode = () =>
		interrupted === undefined
			? undefined
			: 128 + constants.signals[interrupted];
	return {
		async run(command, cwd) {
			const early = interruptedCode();
			if (early !== undefined) return early;
			child = Bun.spawn([...command], {
				cwd,
				stdio: ['inherit', 'inherit', 'inherit'],
			});
			const code = await child.exited;
			return interruptedCode() ?? code;
		},
		dispose() {
			process.off('SIGINT', onInt);
			process.off('SIGTERM', onTerm);
		},
	};
}
