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
 * - `user.passwordChanged` — by `changePassword` and `setPassword`; never by a
 *   reset, which is `user.passwordReset` alone;
 * - `user.emailChanged` — by `update`, when it changed the e-mail — compared
 *   normalised, the same test that makes the new one unverified. The one
 *   event that carries more than the user: `formerEmail`;
 * - `user.secondFactorEnabled` — by `secondFactor.activate`, once the factor
 *   is active: not by `enroll`, which leaves it waiting for its first code;
 * - `user.secondFactorDisabled` — by `secondFactor.disable`, when it removed
 *   an active factor; never for a user who had none, or one still waiting;
 * - `user.recoveryCodesRegenerated` — by `secondFactor.regenerateRecoveryCodes`:
 *   the codes the user held stopped working. Not by `activate`, whose codes
 *   come with `user.secondFactorEnabled`;
 * - `user.recoveryCodeUsed` — by `secondFactor.recover`, once the code is
 *   spent: a sign-in without the user's phone;
 * - `user.deleted` — by `delete`, once; a replay that finds nobody is none.
 */
export type UserEventType =
	| 'user.created'
	| 'user.emailVerified'
	| 'user.passwordReset'
	| 'user.passwordChanged'
	| 'user.emailChanged'
	| 'user.secondFactorEnabled'
	| 'user.secondFactorDisabled'
	| 'user.recoveryCodesRegenerated'
	| 'user.recoveryCodeUsed'
	| 'user.deleted';

/**
 * A user event: **the user named by id, and nothing else** — no login, no
 * field, no password, no token. Whoever receives it reads the rest from where
 * it is kept, if they may. One exception, `formerEmail` on
 * `user.emailChanged`: once the write landed, the old address is kept nowhere.
 */
export interface UserEvent {
	/** A UUIDv7 minted for this event: the key to deliver it once. */
	readonly id: Id;
	readonly type: UserEventType;
	/**
	 * When the write landed: the `createdAt` or `updatedAt` it wrote, or, for
	 * a deletion, the time read just before it — not when the listener ran.
	 */
	readonly occurredAt: Date;
	readonly userId: Id;
	readonly userType: string;
	/**
	 * On `user.emailChanged` only: the address the user had before, as it was
	 * stored — `null` when they had none. So a notice can reach the inbox the
	 * account was just taken from; the new address is on the user. Absent
	 * from every other type, and from an event a webhook delivered.
	 */
	readonly formerEmail?: string | null;
}

/** What an event carries beyond the user, on the one type that does. */
export type EventExtras = Pick<UserEvent, 'formerEmail'>;

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
 * Hands one event to the listener after the write it reports. A flow whose
 * steps after the write matter to the listener — a reset's revocation, a
 * deletion's cleanup — runs them in a `try` and emits from its `finally`, so
 * an outage there does not lose the event for good. Its failure is the application's, not the flow's: warned about, with what
 * it takes to send the event again — never thrown, since the write has landed.
 */
export async function emit(
	context: Context,
	type: UserEventType,
	user: { readonly id: Id; readonly type: string },
	occurredAt: Date,
	extras: EventExtras = {},
): Promise<void> {
	const listener = context.events;
	if (listener === null) return;

	const event: UserEvent = Object.freeze({
		id: mintId(occurredAt.getTime()),
		type,
		// A copy: the record's own Date is also the user the flow answers.
		occurredAt: new Date(occurredAt.getTime()),
		userId: user.id,
		userType: user.type,
		...extras,
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
