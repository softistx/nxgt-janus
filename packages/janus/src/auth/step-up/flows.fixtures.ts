/**
 * What the step-up's specs share: a user signed in, the session they hold,
 * and a request that presents it. Specs only — no case lives here.
 */

import { ada, bearer, password, type setup } from '../../../test/auth';

/** Ada, signed up and signed in: the session a step-up confirms. */
export async function signedIn(context: ReturnType<typeof setup>) {
	const { auth } = context;
	await auth.signUp({ ...ada, password });
	const signed = await auth.signIn({ email: ada.email, password });
	return {
		user: signed.user,
		session: signed.session,
		request: bearer(signed.token),
	};
}

/** A code that is not `code`: the one a user mistypes. */
export const other = (code: string) =>
	code === '000000' ? '111111' : '000000';
