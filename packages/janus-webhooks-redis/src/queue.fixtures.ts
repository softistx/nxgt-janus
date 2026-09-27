import { mintId, type UserEvent } from '@nxgt/janus';

// What the queue.*.spec.ts files share beside test/case.ts's redisPerFile():
// the instant they insert at, the events they insert, and how a call settled.

export const T0 = Date.UTC(2026, 8, 26, 12);
export const at = (ms: number) => new Date(T0 + ms);

export function eventOf(): UserEvent {
	return {
		id: mintId(T0),
		type: 'user.created',
		occurredAt: at(-1_234),
		userId: mintId(T0),
		userType: 'user',
	};
}

/** What a call settled with: its answer, or the error it rejected with. */
export const settled = (promise: Promise<unknown>) =>
	promise.then(
		(answer) => ({ answer }),
		(error: unknown) => ({ error }),
	);
