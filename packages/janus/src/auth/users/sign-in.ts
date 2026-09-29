import {
	CredentialError,
	type CredentialRefusal,
	UserInactiveError,
} from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	passwordMatches,
	passwordRule,
	rehashed,
	requireHasher,
} from '../context';
import { type DeviceHint, reportNewDevice } from '../devices';
import { heldByPassword } from '../password-written';
import { isActive } from '../second-factor/factor';
import { countSignInAttempt, restartSignInCount } from '../sign-in-attempts';
import type { SignInResult } from '../types';
import { byLogin } from './by-login';
import type { Finish, Input } from './flow-types';

/**
 * Checks the password and answers what `finish` answers for the user. One
 * refusal for an unknown login, no password, a wrong one and a login past
 * its attempts; `USER_INACTIVE` only once the password matched.
 */
export async function signIn(
	context: Context,
	type: ResolvedType,
	finish: Finish,
	input: Input,
	call: { readonly where: string; readonly device: DeviceHint },
): Promise<SignInResult<AnyUser>> {
	const { where, device } = call;
	const rule = passwordRule(type, where);
	const hasher = requireHasher(context, where);
	const login = input?.[rule.login];
	const password = input?.password;

	const normalized = typeof login === 'string' ? rule.normalize(login) : null;
	// Counted before the login is looked up, so the count says nothing of
	// whether it is registered.
	if (normalized !== null) {
		await countSignInAttempt(context, type, normalized, where);
	}
	const record =
		normalized === null ? null : await byLogin(context, type, normalized);
	const refuse = (reason: CredentialRefusal) =>
		new CredentialError(
			'CREDENTIALS_INVALID',
			`${where}: the login and the password do not match`,
			{ reason, userType: type.name },
		);

	if (record === null || record.password === null) {
		// Compared all the same, so the response time does not say which
		// logins are registered. The store's own latency stays observable;
		// that limit is documented, not denied.
		await hasher.verify(String(password), await context.dummyHash());
		throw refuse(record === null ? 'unknownLogin' : 'noPassword');
	}

	if (!(await passwordMatches(context, record, String(password), where))) {
		throw refuse('wrongPassword');
	}
	// Checked after the password, so an inactive account is only told to
	// somebody who knows its password.
	if (!record.active) {
		throw new UserInactiveError(`${where}: the user is inactive`, {
			userId: record.id,
			userType: type.name,
		});
	}

	// A session opens: the login's count starts again. With a second factor
	// to come, only its code starts it — the password alone buys no more
	// challenges.
	if (!isActive(record.secondFactor)) {
		await restartSignInCount(context, type, record, where);
	}
	const verified = await rehashed(context, record, String(password));
	const result = await finish(verified, where, device);
	// A password written while this sign-in ran ends it: the password
	// verified above is no longer the user's.
	if (
		!(await heldByPassword(
			context,
			type,
			verified,
			String(password),
			result,
			where,
		))
	) {
		throw refuse('wrongPassword');
	}
	// Complete only now: a sign-in refused above reports no new device.
	await reportNewDevice(context, result);
	return result;
}
