/**
 * `expiresIn`: how long the link or the code of an e-mail stays valid, as
 * the text the e-mail shows — "1 hour", "1 heure". Derived from the
 * `expiresAt` the flow answered and the locale the recipient gets, unless the
 * send passes its own.
 */
import type { Clock } from '@nxgt/janus';

const MINUTE_MS = 60_000;
const MINUTES_IN_HOUR = 60;
const MINUTES_IN_DAY = 24 * MINUTES_IN_HOUR;

/**
 * A duration in the locale, in the largest unit it holds at least once:
 * rounded to the minute first — the flow set `expiresAt` a moment before the
 * send, so an hour is 59 minutes and 59 seconds by then — and then down to a
 * whole unit: 90 minutes is "1 hour", 36 hours "1 day". At 30 seconds or
 * more, the e-mail never promises more than half a minute beyond what is
 * left; under that, it says "1 minute".
 *
 * ```ts
 * formatExpiry(3_600_000, 'fr'); // '1 heure'
 * ```
 */
export function formatExpiry(ms: number, locale: string): string {
	const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
	const [value, unit] =
		minutes >= MINUTES_IN_DAY
			? [Math.floor(minutes / MINUTES_IN_DAY), 'day']
			: minutes >= MINUTES_IN_HOUR
				? [Math.floor(minutes / MINUTES_IN_HOUR), 'hour']
				: [minutes, 'minute'];
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit,
		unitDisplay: 'long',
	}).format(value);
}

/** The per-send `expiresIn`, when one was passed, or `undefined`; a `TypeError` when it is not a string. */
function passedExpiresIn(method: string, options: unknown): string | undefined {
	const read =
		typeof options === 'object' && options !== null
			? (options as { expiresIn?: unknown }).expiresIn
			: undefined;
	if (read !== undefined && typeof read !== 'string') {
		throw new TypeError(`janusMail.${method}: expiresIn must be a string`);
	}
	return read;
}

/**
 * The `expiresIn` of one send: the one passed, as is, or the time left
 * until the flow's `expiresAt` by `clock` — the one given to `janus()`, when
 * it was given to `janusMail()` too — in `locale`. A `TypeError` naming the method
 * when `expiresAt` is not a valid `Date` — a flow's answer that went through
 * JSON holds a string there — or is already past.
 */
export function expiresInFor(
	method: string,
	issued: unknown,
	locale: string,
	options: unknown,
	clock: Clock,
): string {
	const passed = passedExpiresIn(method, options);
	if (passed !== undefined) return passed;
	const expiresAt =
		typeof issued === 'object' && issued !== null
			? (issued as { expiresAt?: unknown }).expiresAt
			: undefined;
	if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
		throw new TypeError(`janusMail.${method}: expiresAt must be a Date`);
	}
	const now = clock.now();
	if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
		throw new TypeError(`janusMail.${method}: clock.now() must answer a Date`);
	}
	const left = expiresAt.getTime() - now.getTime();
	if (left <= 0) {
		throw new TypeError(
			`janusMail.${method}: expiresAt is past — the link or code would not work`,
		);
	}
	return formatExpiry(left, locale);
}
