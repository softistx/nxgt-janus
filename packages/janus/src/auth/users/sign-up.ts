import { StoreConflict, UserInvalidError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	checkPassword,
	emailOf,
	holderOfEmail,
	passwordRule,
	toUser,
	validateFields,
} from '../context';
import { issueEmailToken } from '../email-flows/email-token';
import { countMailByAddress } from '../mail-requests';
import { unlessLoginTaken } from '../outage';
import { sendOnce } from '../prepared';
import type { PreparedSignUp, SignUpOutcome } from '../types';
import { byLogin } from './by-login';
import type { Input } from './flow-types';
import { insert } from './insert';

/**
 * `signUp.prepare`: validates the fields and the password against the policy,
 * and counts the attempt per e-mail address — all before anybody is looked
 * up, with the same store calls whatever the address. Its `send()` creates
 * the user and issues a verification token, or finds the login taken
 * (`prepared.ts`: once).
 */
export async function prepareSignUp(
	context: Context,
	type: ResolvedType,
	input: Input,
	where: string,
): Promise<PreparedSignUp<AnyUser>> {
	const rule = passwordRule(type, where);
	if (rule.login !== type.email) {
		throw new TypeError(
			`${where}: the ${type.name} type signs in with "${rule.login}", not its e-mail "${type.email}" — a taken login would reveal an account and the notice would go to the holder of another address; use signUp`,
		);
	}
	const { password, active: _active, ...rest } = input ?? {};
	const fields = await validateFields(type, rest, where);
	const email = emailOf(type, fields);
	if (email === null) {
		throw new UserInvalidError(
			`${where}: the ${type.name} type needs an e-mail to verify — its schema let it be absent`,
			{ userType: type.name },
		);
	}
	checkPassword(type, password as string, where);
	await countMailByAddress(context, type, 'signUp', email, where);

	// What send() writes is a copy taken now: a later change of the caller's
	// object, or an `active` it carried, changes nothing.
	const written: Input = { ...rest, password };
	const login = fields[rule.login];
	return Object.freeze({
		send: sendOnce(where, () =>
			createOrFindTaken(context, type, written, String(login), email, where),
		),
	});
}

async function createOrFindTaken(
	context: Context,
	type: ResolvedType,
	input: Input,
	login: string,
	email: string,
	where: string,
): Promise<SignUpOutcome<AnyUser>> {
	const written = await unlessLoginTaken(insert(context, type, input, where));
	if (written instanceof StoreConflict) {
		// The login, or the e-mail when it is another login of the user, is held.
		const rule = passwordRule(type, where);
		const holder =
			(await byLogin(context, type, rule.normalize(login))) ??
			(await holderOfEmail(context, type, email));
		// Gone since the conflict: nothing to say about it.
		if (holder === null) throw written;
		return { status: 'taken', user: toUser(holder) };
	}
	const record = written;
	const issued = await issueEmailToken(
		context,
		type,
		'verifyEmail',
		record,
		where,
	);
	return { status: 'created', user: toUser(record), issued };
}
