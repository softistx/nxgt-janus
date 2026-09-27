import { describe, expect, it } from 'bun:test';
import { ada, bearer, clinic, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import type { JanusError } from '../../errors/janus-error';
import { mintId } from '../../ids/id';
import { createMemoryRelations } from '../../permissions/port/memory';
import type { Subject } from '../../subjects/subject';
import { createMemoryStores } from '../port/memory';
import { hashSecret } from '../secrets';

describe('delete', () => {
	it('deletes the user with their sessions and tokens, and frees the login', async () => {
		const { auth, store } = setup();
		const { user, token } = await auth.signUp({ ...ada, password });
		const sent = await auth.verifyEmail.send(user);

		expect(await auth.delete(user)).toBe(true);

		// Read in the store itself: the core would refuse a leftover token all
		// the same, so only the store can tell whether the e-mail it holds went.
		expect(
			await store.tokens.consumeToken(
				hashSecret(sent.token),
				'verifyEmail',
				new Date(),
			),
		).toBeNull();
		expect(await auth.find(user.id)).toBeNull();
		expect(await auth.authenticate(bearer(token))).toBeNull();
		expect(
			await store.sessions.findSessionByTokenHash(hashSecret(token)),
		).toBeNull();
		expect(
			((await rejection(auth.verifyEmail.confirm(sent.token))) as JanusError)
				.code,
		).toBe('TOKEN_UNKNOWN');
		expect(await auth.delete(user)).toBe(false);
		// The e-mail is free for a new account.
		await auth.signUp({ ...ada, password });
	});

	it('answers false for a malformed id, and for another type’s user, whom it leaves whole', async () => {
		const { auth } = clinic();
		const patient = await auth.patient.signUp({
			email: 'ada@example.test',
			birthDate: '1815-12-10',
			password,
		});

		expect(await auth.staff.delete(patient.user)).toBe(false);
		expect(await auth.patient.delete('not-an-id')).toBe(false);
		expect(await auth.patient.find(patient.user.id)).not.toBeNull();
		expect(await auth.authenticate(bearer(patient.token))).not.toBeNull();
	});

	it('leaves only inert leftovers when interrupted, and a replay deletes them', async () => {
		let down = true;
		const inner = createMemoryStores();
		const { auth } = setup({
			store: {
				...inner,
				sessions: {
					...inner.sessions,
					deleteUserSessions: async (userId) => {
						if (down) throw new Error('primary stepped down');
						return inner.sessions.deleteUserSessions(userId);
					},
				},
			},
		});
		const { user, token } = await auth.signUp({ ...ada, password });

		const error = (await rejection(auth.delete(user))) as JanusError;

		expect(error.code).toBe('STORE_FAILED');
		// Gone, and the session left behind authenticates nobody.
		expect(await auth.find(user.id)).toBeNull();
		expect(await auth.authenticate(bearer(token))).toBeNull();
		expect(
			await inner.sessions.findSessionByTokenHash(hashSecret(token)),
		).not.toBeNull();

		down = false;
		expect(await auth.delete(user)).toBe(false);
		expect(
			await inner.sessions.findSessionByTokenHash(hashSecret(token)),
		).toBeNull();
	});

	describe('with a relation store wired', () => {
		const signUp = (auth: ReturnType<typeof clinic>['auth']) =>
			auth.patient.signUp({
				email: `${mintId()}@example.test`,
				birthDate: '1815-12-10',
				password,
			});
		const viewer = (subject: Subject) => ({
			object: { type: 'record', id: mintId() },
			relation: 'viewer',
			subject,
		});

		it('deletes every tuple naming the user, and no one else’s', async () => {
			const relations = createMemoryRelations();
			const { auth } = clinic({ relations });
			const [ada, bob] = [await signUp(auth), await signUp(auth)];
			const own = viewer({ type: 'patient', id: ada.user.id });
			const through = {
				object: { type: 'team', id: mintId() },
				relation: 'member',
				subject: { type: 'patient', id: ada.user.id },
			};
			// Same id, another type: somebody else.
			const namesake = viewer({ type: 'staff', id: ada.user.id });
			const other = viewer({ type: 'patient', id: bob.user.id });
			await relations.write({ add: [own, through, namesake, other] });

			expect(await auth.patient.delete(ada.user)).toBe(true);

			expect(await relations.has(own)).toBe(false);
			expect(await relations.has(through)).toBe(false);
			expect(await relations.has(namesake)).toBe(true);
			expect(await relations.has(other)).toBe(true);
		});

		it('deletes the tuples on the user as an object, and on sets of them', async () => {
			const relations = createMemoryRelations();
			const { auth } = clinic({ relations });
			const [ada, bob] = [await signUp(auth), await signUp(auth)];
			const managed = {
				object: { type: 'patient', id: ada.user.id },
				relation: 'managers',
				subject: { type: 'patient', id: bob.user.id },
			};
			const theirs = viewer({
				type: 'patient',
				id: ada.user.id,
				relation: 'managers',
			});
			await relations.write({ add: [managed, theirs] });

			expect(await auth.patient.delete(ada.user)).toBe(true);

			expect(await relations.has(managed)).toBe(false);
			expect(await relations.has(theirs)).toBe(false);
		});

		it('rejects STORE_FAILED when the tuples cannot be deleted, and a replay deletes them', async () => {
			let down = true;
			const inner = createMemoryRelations();
			const { auth } = clinic({
				relations: {
					...inner,
					deleteEntity: async (entity) => {
						if (down) throw new Error('primary stepped down');
						return inner.deleteEntity(entity);
					},
				},
			});
			const { user } = await signUp(auth);
			const own = viewer({ type: 'patient', id: user.id });
			await inner.write({ add: [own] });

			const error = (await rejection(auth.patient.delete(user))) as JanusError;
			expect(error.code).toBe('STORE_FAILED');
			expect(await auth.patient.find(user.id)).toBeNull();
			expect(await inner.has(own)).toBe(true);

			down = false;
			expect(await auth.patient.delete(user)).toBe(false);
			expect(await inner.has(own)).toBe(false);
		});

		it('refuses, when wiring, a relation store that cannot delete', () => {
			const { deleteEntity: _, ...partial } = createMemoryRelations();

			expect(() => clinic({ relations: partial as never })).toThrow(
				'relations.deleteEntity is missing',
			);
		});
	});
});
