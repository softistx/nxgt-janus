/**
 * Proving an e-mail on the application's own proof of the inbox — an
 * invitation token it issued to the address — with the ending a first
 * sign-in by link or code gives an e-mail never proved (`../first-proof`).
 */

import { StoreConflict, UserInactiveError } from '../../errors/janus-error';
import type { At } from '../at';
import { normalizeEmail, type ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	emailOf,
	getRecord,
	refId,
	toUser,
} from '../context';
import { proveFirstEmail } from '../first-proof';
import { unlessVersionConflict } from '../outage';
import type { UserRecord } from '../port/types';
import type { VerifyEmailApi } from '../types';

/**
 * `verifyEmail.proveFirst` for one user type: the user read by id —
 * `NOT_FOUND` for nobody, as `signInProven` — refused when inactive, then,
 * when the e-mail was never proved, `proveFirstEmail` exactly as
 * `magicLink.confirm` and `signInCode.confirm` run it, decided the same way:
 * on the record read, `emailVerifiedAt === null`. An e-mail already proved
 * is answered as it is, with nothing written.
 *
 * **A write landing between the read and the proof is retried once.**
 * `VERSION_CONFLICT` from `proveFirstEmail` runs the whole flow again on a
 * fresh read: nobody, or an inactive user, is refused as before; an e-mail
 * that is no longer the one first read — compared as e-mails are — is a
 * `VERSION_CONFLICT` naming both versions, since the proof the caller holds is for the address
 * it read and janus never proves another; an e-mail proved meanwhile is
 * answered `proved: false`; otherwise the proof runs under the new version.
 * A second `VERSION_CONFLICT` propagates.
 *
 * Running `proveFirstEmail` twice is harmless: a failed attempt wrote
 * nothing and sent no event (events follow the write); all it left is the
 * sessions revoked and the tokens spent before the write, which the second
 * attempt does again to the same end.
 *
 * No throttle is counted and no count restarted, no e-mail sent and no
 * token issued; the only tokens spent are the ones `proveFirstEmail`
 * spends, what the password opened.
 */
export function proveFirstFlow(
	context: Context,
	type: ResolvedType,
	at: At,
): VerifyEmailApi<AnyUser>['verifyEmail']['proveFirst'] {
	return async (user) => {
		const where = at('verifyEmail.proveFirst');
		const id = refId(user);
		const first = await readActive(context, type, id, where);
		const answer = await unlessVersionConflict(
			proveOrAnswer(context, type, first, where),
		);
		if (answer !== null) return answer;
		const again = await readActive(context, type, id, where);
		if (!sameEmail(type, first, again)) {
			throw new StoreConflict(
				'version',
				`${where}: the e-mail changed since it was read`,
				{
					userId: first.id,
					expectedVersion: first.version,
					actualVersion: again.version,
					operation: where,
				},
			);
		}
		return proveOrAnswer(context, type, again, where);
	};
}

/** The user read by id, refused when inactive. */
async function readActive(
	context: Context,
	type: ResolvedType,
	id: string,
	where: string,
): Promise<UserRecord> {
	const record = await getRecord(context, id, type.name, where);
	if (!record.active) {
		throw new UserInactiveError(`${where}: the user is inactive`, {
			userId: record.id,
			userType: type.name,
		});
	}
	return record;
}

/** `proved: false` for an e-mail already proved, else the proof itself. */
async function proveOrAnswer(
	context: Context,
	type: ResolvedType,
	record: UserRecord,
	where: string,
): Promise<{ user: AnyUser; proved: boolean }> {
	if (record.emailVerifiedAt !== null) {
		return { user: toUser(record), proved: false };
	}
	const proved = await proveFirstEmail(context, type, record, where);
	return { user: toUser(proved), proved: true };
}

/** Whether both records hold one address, compared as e-mails are. */
function sameEmail(type: ResolvedType, a: UserRecord, b: UserRecord): boolean {
	const held = (record: UserRecord) => {
		const email = emailOf(type, record.fields);
		return email === null ? null : normalizeEmail(email);
	};
	return held(a) === held(b);
}
