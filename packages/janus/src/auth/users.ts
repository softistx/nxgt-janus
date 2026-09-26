import { CredentialError, UserInactiveError } from '../errors/janus-error';
import { isId, mintId } from '../ids/id';
import { invalidCursor, pageLimit } from '../pagination/cursor-page';
import { isStorable } from '../stores/storable';
import { normalizeEmail, type ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	checkPassword,
	emailOf,
	findRecord,
	getRecord,
	idOf,
	loginsOf,
	passwordMatches,
	passwordRule,
	rehashed,
	requireHasher,
	toUser,
	validateFields,
	writeUser,
} from './context';
import { emailFlows } from './email-flows';
import { emit } from './events';
import { endSignInsWaiting, heldByPassword } from './password-written';
import type { UserRecord } from './port/types';
import { secondFactorFlows } from './second-factor/flows';
import { openSession } from './sessions';
import { signInCodeFlows } from './sign-in-code';
import type {
	PasswordApi,
	ResetPasswordApi,
	SecondFactorApi,
	SignInCodeApi,
	SignInResult,
	UserTypeApi,
	VerifyEmailApi,
} from './types';

type Input = Record<string, unknown>;

/** Everything one user type answers. Which flows it has is decided by its types; all are built. */
export type AnyTypeApi = UserTypeApi<AnyUser, Input> &
	PasswordApi<AnyUser, Input, string, SignInResult<AnyUser>> &
	SecondFactorApi<AnyUser> &
	SignInCodeApi<AnyUser, SignInResult<AnyUser>> &
	VerifyEmailApi<AnyUser> &
	ResetPasswordApi<AnyUser>;

export function typeApi(context: Context, type: ResolvedType): AnyTypeApi {
	const { store, clock } = context;
	const at = (operation: string) =>
		context.config.single ? operation : `${type.name}.${operation}`;
	const secondFactor = secondFactorFlows(context, type, at);
	const signInCode = signInCodeFlows(context, type, at, secondFactor.finish);

	/**
	 * The user holding this normalised login, or `null`. A login no store can
	 * keep is nobody's: answered as an absence, without asking a store that
	 * would fail on it.
	 */
	const byLogin = async (login: string): Promise<UserRecord | null> =>
		isStorable(login) ? store.users.findUserByLogin(type.name, login) : null;

	/** Validates, hashes, writes once. What `create` and `signUp` share. */
	const insert = async (input: Input, where: string): Promise<UserRecord> => {
		const { password, active, ...rest } = input ?? {};
		const now = clock.now();
		const fields = await validateFields(type, rest, where);

		let hash: UserRecord['password'] = null;
		if (password !== undefined) {
			checkPassword(type, password as string, where);
			hash = {
				hash: await requireHasher(context, where).hash(password as string),
				updatedAt: now,
			};
		}

		const inserted = await store.users.insertUser({
			id: mintId(now.getTime()),
			type: type.name,
			schemaVersion: type.schemaVersion,
			active: active === undefined ? true : active === true,
			fields,
			logins: loginsOf(type, fields, where),
			password: hash,
			secondFactor: null,
			emailVerifiedAt: null,
			version: 0,
			createdAt: now,
			updatedAt: now,
		});
		// Once the user exists: an outage opening signUp's session later still
		// leaves a user created, and reported.
		await emit(context, 'user.created', inserted, inserted.createdAt);
		return inserted;
	};

	return {
		async create(input) {
			return toUser(await insert(input as Input, at('create')));
		},

		async find(id) {
			const record = await findRecord(context, id, type.name);
			return record === null ? null : toUser(record);
		},

		async get(id) {
			return toUser(await getRecord(context, id, type.name, at('get')));
		},

		async list(page) {
			const after = page?.after ?? null;
			// Never a silent first page: a caller paging a list would loop for
			// ever, and the loop would look like a slow query.
			if (after !== null && !isId(after)) {
				throw invalidCursor(at('list'), after);
			}

			const answer = await store.users.listUsers({
				type: type.name,
				after,
				limit: pageLimit(page?.limit, at('list')),
			});
			return { items: answer.items.map(toUser), nextCursor: answer.nextCursor };
		},

		async update(user, patch, options) {
			const where = at('update');
			const written = await writeUser(
				context,
				user,
				type,
				options,
				where,
				async (record) => {
					const fields = await validateFields(
						type,
						{ ...record.fields, ...(patch as Input) },
						where,
					);
					const before = emailOf(type, record.fields);
					const after = emailOf(type, fields);
					const emailChanged =
						(before === null ? null : normalizeEmail(before)) !==
						(after === null ? null : normalizeEmail(after));

					return {
						fields,
						logins: loginsOf(type, fields, where),
						schemaVersion: type.schemaVersion,
						// A new e-mail is an unproven one.
						...(emailChanged ? { emailVerifiedAt: null } : {}),
					};
				},
			);
			return toUser(written);
		},

		async setActive(user, active, options) {
			return toUser(
				await writeUser(context, user, type, options, at('setActive'), () => ({
					active: active === true,
				})),
			);
		},

		async delete(user) {
			const id = idOf(user);
			if (!isId(id)) return false;

			// Read first, so a staff API never deletes a patient: another type's
			// id is answered as nobody, and nothing of theirs is touched.
			const record = await store.users.findUser(id);
			if (record !== null && record.type !== type.name) return false;

			// The user first: from then on nobody can sign in as them, and what
			// is left — sessions, tokens — is refused for a user who is gone. An
			// outage between the steps leaves only that inert remainder, and a
			// replay, finding no user, still deletes it.
			const deletedAt = clock.now();
			const deleted = record !== null && (await store.users.deleteUser(id));
			// Once, when this call deleted them, and before the steps an outage
			// can interrupt: a replay deletes nobody, so it could not send it.
			if (deleted) {
				await emit(context, 'user.deleted', { id, type: type.name }, deletedAt);
			}
			await store.sessions.deleteUserSessions(id);
			await store.tokens.deleteUserTokens(id);
			// Last, and on a replay too: the tuples naming them.
			await context.relations?.deleteEntity({ type: type.name, id });
			return deleted;
		},

		async signUp(input) {
			const where = at('signUp');
			passwordRule(type, where);
			if ((input as Input)?.password === undefined) {
				checkPassword(type, undefined as unknown as string, where);
			}
			const record = await insert(input as Input, where);
			return openSession(context, type, record);
		},

		async signIn(input) {
			const where = at('signIn');
			const rule = passwordRule(type, where);
			const hasher = requireHasher(context, where);
			const login = (input as Input)?.[rule.login];
			const password = (input as Input)?.password;

			const record =
				typeof login === 'string' ? await byLogin(rule.normalize(login)) : null;
			const refuse = (
				reason: 'unknownLogin' | 'noPassword' | 'wrongPassword',
			) =>
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

			const verified = await rehashed(context, record, String(password));
			const result = await secondFactor.finish(verified, where);
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
		},

		async findByLogin(login) {
			const rule = passwordRule(type, at('findByLogin'));
			const record = await byLogin(rule.normalize(login));
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
			await endSignInsWaiting(context, written.id);
			return toUser(written);
		},

		async changePassword(user, change, options) {
			const where = at('changePassword');
			passwordRule(type, where);
			checkPassword(type, change?.next, where);
			const hasher = requireHasher(context, where);

			const written = await writeUser(
				context,
				user,
				type,
				options,
				where,
				async (record, now) => {
					if (
						record.password === null ||
						!(await passwordMatches(context, record, change.current, where))
					) {
						throw new CredentialError(
							'CREDENTIALS_INVALID',
							`${where}: the current password does not match`,
							{
								reason:
									record.password === null ? 'noPassword' : 'wrongPassword',
								userId: record.id,
								userType: type.name,
							},
						);
					}
					return {
						password: {
							hash: await hasher.hash(change.next),
							updatedAt: now,
						},
					};
				},
			);
			await endSignInsWaiting(context, written.id);
			return toUser(written);
		},

		secondFactor: secondFactor.api,
		signInCode,

		...emailFlows(context, type, at),
	};
}
