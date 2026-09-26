import { type Id, mintId } from '../ids/id';
import type { Context } from './context';

/**
 * What happened to a user, once it is written:
 *
 * - `user.created` — by `create` or `signUp`;
 * - `user.emailVerified` — by `verifyEmail.confirm`, or by the link of
 *   `resetPassword.confirm` or the code of `signInCode.confirm`, which prove
 *   the e-mail too; never for an e-mail already verified;
 * - `user.passwordReset` — by `resetPassword.confirm`;
 * - `user.deleted` — by `delete`, once; a replay that finds nobody is none.
 */
export type UserEventType =
	| 'user.created'
	| 'user.emailVerified'
	| 'user.passwordReset'
	| 'user.deleted';

/**
 * A user event: **the user named by id, and nothing else** — no login, no
 * e-mail, no field, no password, no token. Whoever receives it reads the rest
 * from where it is kept, if they may.
 */
export interface UserEvent {
	/** A UUIDv7 minted for this event: the key to deliver it once. */
	readonly id: Id;
	readonly type: UserEventType;
	/**
	 * When the write landed: the `createdAt` or `updatedAt` it wrote, or, for
	 * a deletion, the time read just before it.
	 */
	readonly occurredAt: Date;
	readonly userId: Id;
	readonly userType: string;
}

/**
 * What `janus({ events })` takes: called once per event, **after** the write
 * landed and before the flow answers — awaited, so a queue that stores the
 * event durably has done so by then. A listener that throws fails nothing:
 * the write happened, and the flow answers as it would have. The failure is a
 * `JANUS_EVENT_FAILED` warning naming the event, never silence.
 */
export type UserEventListener = (event: UserEvent) => void | Promise<void>;

/** The listener given to `janus()`, or a wiring refusal for a JavaScript caller. */
export function resolveEvents(
	events: unknown,
	where: string,
): UserEventListener | null {
	if (events === undefined) return null;
	if (typeof events !== 'function') {
		throw new TypeError(
			`${where}: events must be a function that takes a user event — webhooks({ … }) from @nxgt/janus-webhooks, or your own`,
		);
	}
	return events as UserEventListener;
}

/**
 * Hands one event to the listener, right after the write it reports — before
 * any store call that follows, whose outage would otherwise lose it for good.
 * Its failure is the application's, not the flow's: warned about, with what
 * it takes to send the event again — never thrown, since the write has landed.
 */
export async function emit(
	context: Context,
	type: UserEventType,
	user: { readonly id: Id; readonly type: string },
	occurredAt: Date,
): Promise<void> {
	const listener = context.events;
	if (listener === null) return;

	const event: UserEvent = Object.freeze({
		id: mintId(occurredAt.getTime()),
		type,
		occurredAt,
		userId: user.id,
		userType: user.type,
	});
	try {
		await listener(event);
	} catch (failure) {
		process.emitWarning(
			`janus: the events listener failed on ${type} ${event.id} for user ${user.id}: ${failure instanceof Error ? failure.name : typeof failure}`,
			{ code: 'JANUS_EVENT_FAILED' },
		);
	}
}
