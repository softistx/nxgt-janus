/**
 * The one wiring mistake the mail throttle cannot refuse: a `tokens.*`
 * lifetime shorter than `mail.throttle.window`. A refused request spends
 * nothing, so the last link or code sent keeps working, but only while it has
 * not expired: with a shorter lifetime it can lapse before the refusal ends.
 * That is a choice an application may make on purpose, so it is a warning,
 * emitted once per `janus()` call, never an error.
 */

import type { ResolvedConfig } from './resolved-config';

/** The flows the mail throttle counts, in the order a warning names them. */
const FLOWS = [
	'magicLink',
	'signInCode',
	'resetPassword',
	'verifyEmail',
	'stepUp',
] as const;

const UNITS: readonly (readonly [string, number])[] = [
	['d', 86_400_000],
	['h', 3_600_000],
	['m', 60_000],
	['s', 1_000],
];

/** `600000` as `10m`: the largest unit that divides it exactly. */
function show(ms: number): string {
	const unit = UNITS.find(([, size]) => ms % size === 0);
	return unit === undefined ? `${ms}ms` : `${ms / unit[1]}${unit[0]}`;
}

/** The warning's text, or `null` when no lifetime is shorter than the window. */
export function throttleWindowMessage(
	resolved: Pick<ResolvedConfig, 'mailThrottle' | 'tokenTtlMs'>,
	where: string,
): string | null {
	const throttle = resolved.mailThrottle;
	if (throttle === null) return null;
	const window = show(throttle.windowMs);
	const shorter = FLOWS.filter(
		(flow) => resolved.tokenTtlMs[flow] < throttle.windowMs,
	);
	if (shorter.length === 0) return null;
	const shortest = Math.min(
		...shorter.map((flow) => resolved.tokenTtlMs[flow]),
	);
	const parts = shorter.map(
		(flow) =>
			`tokens.${flow} is ${show(resolved.tokenTtlMs[flow])}, shorter than mail.throttle.window, ${window}`,
	);
	return `${where}: ${parts.join('; ')} — past the limit the last ${shorter.length === 1 ? 'token' : 'tokens'} sent can expire before the refusal ends. Set mail.throttle.window to ${show(shortest)} or less, or raise ${shorter.map((flow) => `tokens.${flow}`).join(', ')} to ${window} or more.`;
}

/** Emits {@link throttleWindowMessage} through `process.emitWarning`, where the runtime has one. */
export function warnThrottleWindow(
	resolved: Pick<ResolvedConfig, 'mailThrottle' | 'tokenTtlMs'>,
	where: string,
): void {
	const message = throttleWindowMessage(resolved, where);
	if (message === null) return;
	if (
		typeof process === 'undefined' ||
		typeof process.emitWarning !== 'function'
	) {
		return;
	}
	process.emitWarning(message, { code: 'JANUS_THROTTLE_WINDOW' });
}
