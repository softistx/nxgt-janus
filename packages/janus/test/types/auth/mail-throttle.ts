/**
 * The mail throttle: what `mail.throttle` takes, and what a throttled
 * request's refusal carries. Cases 61–65 of the seventy-two — see
 * `fixtures.ts`. The shapes that must keep compiling are at the end of this
 * file.
 */

import { type JanusError, janus, MailThrottledError } from '../../../src/index';
import { hasher, Patient, store } from './fixtures';

// ── 61. Turning the throttle on with true ──────────────────────────────────
// It is on by default; the option takes a limit, or false.
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error throttle is { attempts, window } or false
	mail: { throttle: true },
});

// ── 62. A limit written as a string ───────────────────────────────────────
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error attempts is a number
	mail: { throttle: { attempts: '5' } },
});

// ── 63. A window that is not a duration ───────────────────────────────────
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error '15 minutes' is not a Duration: '15m'
	mail: { throttle: { window: '15 minutes' } },
});

// ── 64. Turning the throttle off with mail: false ─────────────────────────
// It reads as mail turned off; the throttle is what is turned off.
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error mail: { throttle: false }
	mail: false,
});

function refusal(error: unknown) {
	if (!(error instanceof MailThrottledError)) return;

	// ── 65. A throttled request read as a sign-in's refusal ───────────────
	// Its code is MAIL_THROTTLED, never CREDENTIALS_INVALID with a reason.
	// @ts-expect-error MailThrottledError's code is 'MAIL_THROTTLED'
	if (error.code === 'CREDENTIALS_INVALID') return;
}

// ── Allowed: a limit, a window, or false; the code and the seconds read ───
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	mail: { throttle: { attempts: 3, window: '1h' } },
});
janus({
	users: { patient: { schema: Patient, password: { login: 'email' } } },
	store,
	hasher,
	mail: { throttle: false },
});

function allowed(error: JanusError): number | undefined {
	if (error.code === 'MAIL_THROTTLED') return error.retryAfter;
	if (error instanceof MailThrottledError) {
		const seconds: number | undefined = error.retryAfter;
		return seconds;
	}
	return undefined;
}

export const checked = { refusal, allowed };
