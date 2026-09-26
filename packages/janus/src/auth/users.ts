import {
	CredentialError,
	NotFoundError,
	TokenError,
	UserInactiveError,
} from '../errors/janus-error';
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
	rehashed,
	requireHasher,
	toUser,
	validateFields,
	writeUser,
} from './context';
import type { TokenKind, TokenRecord, UserRecord } from './port/types';
import { hashSecret, mintSecret } from './secrets';
import { openSession } from './sessions';
import type {
	IssuedToken,
	PasswordApi,
	ResetPasswordApi,
	UserTypeApi,
	VerifyEmailApi,
} from './types';

type Input = Record<string, unknown>;

/** Everything one user type answers. Which flows it has is decided by its types; all are built. */
export type AnyTypeApi = UserTypeApi<AnyUser, Input> &
	PasswordApi<AnyUser, Input, string> &
	VerifyEmailApi<AnyUser> &
	ResetPasswordApi<AnyUser>;

export function typeApi(context: Context, type: ResolvedType): AnyTypeApi {
	const { store, clock } = context;
	const at = (operation: string) =>
		context.config.single ? operation : `${type.name}.${operation}`;

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

		return store.users.insertUser({
			id: mintId(now.getTime()),
			type: type.name,
			schemaVersion: type.schemaVersion,
			active: active === undefined ? true : active === true,
			fields,
			logins: loginsOf(type, fields, where),
			password: hash,
			emailVerifiedAt: null,
			version: 0,
			createdAt: now,
			updatedAt: now,
		});
	};

	/**
	 * Spends a token and says why it cannot be used, when it cannot.
	 *
	 * The store answers the token **as it was before the call**: `spentAt: null`
	 * means this call spent it, and exactly one call ever sees that. A lapsed
	 * token is spent all the same, so it cannot be retried. None of these
	 * messages names the token: it is a secret, and so is its hash.
	 */
	const redeem = async (
		kind: TokenKind,
		secret: string,
		where: string,
	): Promise<{ token: TokenRecord; user: UserRecord }> => {
		const now = clock.now();
		const token = await store.tokens.consumeToken(
			hashSecret(secret),
			kind,
			now,
		);

		if (token === null) {
			throw new TokenError('TOKEN_UNKNOWN', `${where}: no such token`, {
				operation: where,
			});
		}
		if (token.spentAt !== null) {
			throw new TokenError(
				'TOKEN_SPENT',
				`${where}: the token was already used`,
				{
					operation: where,
				},
			);
		}
		if (token.expiresAt.getTime() <= now.getTime()) {
			throw new TokenError('TOKEN_EXPIRED', `${where}: the token has expired`, {
				operation: where,
			});
		}

		// A user gone since, or of another type, is as good as no token.
		const user = await findRecord(context, token.userId, type.name);
		if (user === null) {
			throw new TokenError('TOKEN_UNKNOWN', `${where}: no such token`, {
				operation: where,
			});
		}

		const email = emailOf(type, user.fields);
		if (
			email === null ||
			normalizeEmail(email) !== normalizeEmail(token.address)
		) {
			throw new TokenError(
				'TOKEN_STALE',
				`${where}: the token was sent to an e-mail the user no longer has`,
				{ operation: where, userId: user.id, userType: type.name },
			);
		}

		return { token, user };
	};

	/** Issues a one-time token for the user's current e-mail. */
	const issue = async (
		kind: TokenKind,
		user: UserRecord,
		where: string,
	): Promise<IssuedToken> => {
		const email = emailOf(type, user.fields);
		if (email === null) {
			throw new NotFoundError(`${where}: the user has no e-mail`, {
				userId: user.id,
				userType: type.name,
				operation: where,
			});
		}

		const now = clock.now();
		const secret = mintSecret();
		const expiresAt = new Date(now.getTime() + context.config.tokenTtlMs[kind]);

		await store.tokens.insertToken({
			tokenHash: hashSecret(secret),
			kind,
			userId: user.id,
			address: email,
			expiresAt,
			spentAt: null,
			createdAt: now,
		});

		return { token: secret, email, expiresAt };
	};

	/** The type's password rule, or a wiring refusal for a JavaScript caller. */
	const passwordRule = (where: string) => {
		if (type.password === null) {
			throw new TypeError(
				`${where}: the ${type.name} type does not sign in with a password — add password: { login } to it`,
			);
		}
		return type.password;
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
			const deleted = record !== null && (await store.users.deleteUser(id));
			await store.sessions.deleteUserSessions(id);
			await store.tokens.deleteUserTokens(id);
			// Last, and on a replay too: the tuples naming them.
			await context.relations?.deleteEntity({ type: type.name, id });
			return deleted;
		},

		async signUp(input) {
			const where = at('signUp');
			passwordRule(where);
			if ((input as Input)?.password === undefined) {
				checkPassword(type, undefined as unknown as string, where);
			}
			const record = await insert(input as Input, where);
			return openSession(context, type, record);
		},

		async signIn(input) {
			const where = at('signIn');
			const rule = passwordRule(where);
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

			return openSession(
				context,
				type,
				await rehashed(context, record, String(password)),
			);
		},

		async findByLogin(login) {
			const rule = passwordRule(at('findByLogin'));
			const record = await byLogin(rule.normalize(login));
			return record === null ? null : toUser(record);
		},

		async setPassword(user, password, options) {
			const where = at('setPassword');
			passwordRule(where);
			checkPassword(type, password, where);
			const hash = await requireHasher(context, where).hash(password);

			return toUser(
				await writeUser(context, user, type, options, where, (_, now) => ({
					password: { hash, updatedAt: now },
				})),
			);
		},

		async changePassword(user, change, options) {
			const where = at('changePassword');
			passwordRule(where);
			checkPassword(type, change?.next, where);
			const hasher = requireHasher(context, where);

			return toUser(
				await writeUser(
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
				),
			);
		},

		verifyEmail: {
			async send(user) {
				const where = at('verifyEmail.send');
				const record = await getRecord(context, idOf(user), type.name, where);
				return issue('verifyEmail', record, where);
			},

			async confirm(secret) {
				const where = at('verifyEmail.confirm');
				const { user } = await redeem('verifyEmail', secret, where);
				return toUser(
					await writeUser(
						context,
						user.id,
						type,
						undefined,
						where,
						(_, now) => ({
							emailVerifiedAt: now,
						}),
					),
				);
			},
		},

		resetPassword: {
			async request(email) {
				const where = at('resetPassword.request');
				passwordRule(where);
				const wanted = normalizeEmail(String(email));
				const record = await byLogin(wanted);

				// Found by a login that is not their e-mail — a username that looks
				// like one — is nobody's e-mail: no token.
				const held = record === null ? null : emailOf(type, record.fields);
				if (
					record === null ||
					held === null ||
					normalizeEmail(held) !== wanted
				) {
					return null;
				}

				const issued = await issue('resetPassword', record, where);
				return { ...issued, user: toUser(record) };
			},

			async confirm(secret, password) {
				const where = at('resetPassword.confirm');
				passwordRule(where);
				// Checked before the token is spent: a password refused for its
				// length must not cost the visitor their link.
				checkPassword(type, password, where);
				const hash = await requireHasher(context, where).hash(password);

				const { user } = await redeem('resetPassword', secret, where);
				const written = await writeUser(
					context,
					user.id,
					type,
					undefined,
					where,
					(record, now) => ({
						password: { hash, updatedAt: now },
						// The link reached the inbox: that proves the e-mail.
						...(record.emailVerifiedAt === null
							? { emailVerifiedAt: now }
							: {}),
					}),
				);

				// Whoever had the old password is signed out.
				await store.sessions.revokeUserSessions(written.id, clock.now());
				return toUser(written);
			},
		},
	};
}
