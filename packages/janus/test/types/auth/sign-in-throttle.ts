/**
 * The sign-in throttle: what `signIn.throttle` takes, and what a throttled
 * refusal carries. Cases 43–48 of the forty-eight — see `fixtures.ts`. The
 * shapes that must keep compiling are at the end of this file.
 */

import { JanusError, janus } from '../../../src/index';
import { hasher, Patient, store } from './fixtures';

// ── 43. Turning the throttle on with true ──────────────────────────────────
// It is on by default; the option takes a limit, or false.
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error throttle is { attempts, window } or false
	signIn: { throttle: true },
});

// ── 44. A limit written as a string ───────────────────────────────────────
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error attempts is a number
	signIn: { throttle: { attempts: '10' } },
});

// ── 45. A window that is not a duration ───────────────────────────────────
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error '15 minutes' is not a Duration: '15m'
	signIn: { throttle: { window: '15 minutes' } },
});

// ── 46. Turning the throttle off with signIn: false ───────────────────────
// It reads as signing in turned off; the throttle is what is turned off.
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	// @ts-expect-error signIn: { throttle: false }
	signIn: false,
});

function refusal(error: unknown) {
	if (!(error instanceof JanusError)) return;

	// ── 47. Waiting for a lockout ─────────────────────────────────────────
	// Nothing locks: a login past its attempts is `throttled` until the window ends.
	// @ts-expect-error no refusal is 'locked'
	if (error.reason === 'locked') return;

	// ── 48. retryAfter read as a date ─────────────────────────────────────
	// It is seconds, as the Retry-After header takes them.
	// @ts-expect-error retryAfter is a number of seconds
	const at: Date | undefined = error.retryAfter;
	void at;
}

// ── Allowed: a limit, a window, or false; the reason and the seconds read ──
janus({
	user: Patient,
	password: { login: 'email' },
	store,
	hasher,
	signIn: { throttle: { attempts: 5, window: '1h' } },
});
janus({
	users: { patient: { schema: Patient, password: { login: 'email' } } },
	store,
	hasher,
	signIn: { throttle: false },
});

function allowed(error: JanusError): string | undefined {
	if (error.code === 'CREDENTIALS_INVALID' && error.reason === 'throttled') {
		const seconds: number | undefined = error.retryAfter;
		return String(seconds);
	}
	return undefined;
}

export const checked = { refusal, allowed };
