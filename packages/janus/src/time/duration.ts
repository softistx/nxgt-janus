/**
 * A span of time, written the way a configuration file writes one: `'15m'`,
 * `'720h'`, `'30d'`. A plain number is milliseconds.
 *
 * Strings rather than milliseconds everywhere, because `2592000000` in a config
 * object is a number nobody reads back correctly, and Ory's own configuration
 * uses exactly this notation — so a team moving across recognises it.
 */
export type Duration = number | `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

const UNITS = {
	ms: 1,
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
} as const;

const PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/;

/**
 * The duration in milliseconds.
 *
 * `where` names the option the consumer wrote — `session.lifespan`, not
 * `parseDuration` — because this package has half a dozen durations and a
 * message that does not say which one leaves the reader to guess.
 *
 * A bare `TypeError`: durations are written when the application is wired, so
 * this cannot come from a request, and no handler should answer it. The refusal
 * reports the **shape** expected and not the value's own bytes beyond echoing
 * it, which is the rule this repository inherits.
 */
export function parseDuration(value: Duration, where: string): number {
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value <= 0) {
			throw new TypeError(
				`${where}: a duration in milliseconds must be a finite number above zero`,
			);
		}
		return value;
	}

	const match = PATTERN.exec(value);

	if (!match) {
		throw new TypeError(
			`${where}: "${value}" is not a duration; write a number followed by ms, s, m, h or d — for example "15m" or "720h"`,
		);
	}

	const amount = Number(match[1]);
	const unit = match[2] as keyof typeof UNITS;
	const ms = amount * UNITS[unit];

	if (ms <= 0) {
		throw new TypeError(`${where}: a duration must be above zero`);
	}

	return ms;
}
