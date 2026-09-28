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
import { heldByPassword } from '../password-written';
import type { SignInResult } from '../types';
import { byLogin } from './by-login';
import type { Finish, Input } from './flow-types';
import { countSignInAttempt } from './sign-in-attempts';

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
	where: string,
): Promise<SignInResult<AnyUser>> {
	const rule = passwordRule(type, where);
	const hasher = requireHasher(context, where);
	const login = input?.[rule.login];
	const password = input?.password;

	const normalized = typeof login === 'string' ? rule.normalize(login) : null;
	// Counted before the login is looked up, so the count says nothing of
	// whether it is registered.
	const restart =
		normalized === null
			? null
			: await countSignInAttempt(context, type, normalized, where);
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

	// The password was right: the login's count starts again.
	await restart?.();
	const verified = await rehashed(context, record, String(password));
	const result = await finish(verified, where);
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
	return result;
}
