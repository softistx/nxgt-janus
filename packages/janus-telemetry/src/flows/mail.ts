import { createLogger, event } from '@nxgt/telemetry';
import type { Outcome } from '../traced';
import type { Call } from './call';
import { refusalFields } from './fields';

const log = createLogger('@nxgt/janus');

/** Too many e-mails asked for one address, or one user, in a window. */
const mailThrottled = event('janus.mail.throttled');

type Written = (call: Call, outcome: Outcome) => void;

/**
 * What a request that hands out something to e-mail writes: a
 * `janus.mail.throttled` warning when it was refused past its limit — with
 * the flow and the seconds to wait, never the address — and otherwise what
 * `written` writes, if anything.
 */
export function mailRequest(written?: Written): Written {
	return (call, outcome) => {
		if (!outcome.ok && outcome.refusal.code === 'MAIL_THROTTLED') {
			// Nothing was issued, so nothing is sent.
			log.warn(
				mailThrottled({
					...refusalFields(call, outcome.refusal),
					'janus.mail.flow': call.flow,
					...(outcome.refusal.retryAfter === undefined
						? {}
						: { 'janus.mail.retryAfter': outcome.refusal.retryAfter }),
				}),
			);
			return;
		}
		written?.(call, outcome);
	};
}
