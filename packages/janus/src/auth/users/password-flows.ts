import type { At } from '../at';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	checkPassword,
	passwordRule,
	requireHasher,
	toUser,
	writeUser,
} from '../context';
import { passwordChanged } from '../password-written';
import { openSession } from '../sessions';
import type { PasswordApi, SignInResult } from '../types';
import { byLogin } from './by-login';
import { changePassword } from './change-password';
import type { Finish, Input } from './flow-types';
import { insert } from './insert';
import { signIn } from './sign-in';

/**
 * The password flows of one user type: signing up and in, finding a user by
 * the login they sign in with, and setting or changing their password.
 */
export function passwordFlows(
	context: Context,
	type: ResolvedType,
	at: At,
	finish: Finish,
): PasswordApi<AnyUser, Input, string, SignInResult<AnyUser>> {
	return {
		async signUp(input) {
			const where = at('signUp');
			passwordRule(type, where);
			if ((input as Input)?.password === undefined) {
				checkPassword(type, undefined as unknown as string, where);
			}
			const record = await insert(context, type, input as Input, where);
			return openSession(context, type, record);
		},

		async signIn(input) {
			return signIn(context, type, finish, input as Input, at('signIn'));
		},

		async findByLogin(login) {
			const rule = passwordRule(type, at('findByLogin'));
			const record = await byLogin(context, type, rule.normalize(login));
			return record === null ? null : toUser(record);
		},

		async setPassword(user, password, options) {
			const where = at('setPassword');
			passwordRule(type, where);
			checkPassword(type, password, where);
			const hash = await requireHasher(context, where).hash(password);

			const written = await writeUser(
				context,
				user,
				type,
				options,
				where,
				(_, now) => ({ password: { hash, updatedAt: now } }),
			);
			await passwordChanged(context, written);
			return toUser(written);
		},

		async changePassword(user, change, options) {
			const where = at('changePassword');
			return toUser(
				await changePassword(context, type, user, change, options, where),
			);
		},
	};
}
