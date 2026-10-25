/**
 * The avatar of a user — `avatar.set` and `avatar.remove`: an id that is
 * missing or no string, a remove that takes an avatar, the name `avatar`
 * given to a user type, and a schema declaring it. Cases 103–107 of the one hundred and seven — see
 * `fixtures.ts`. The shapes that must keep compiling are at the end of this
 * file.
 */

import { z } from 'zod';
import { janus } from '../../../src/index';
import { clinic, hasher, one, store } from './fixtures';

async function avatar() {
	// ── 103. An avatar without its id ───────────────────────────────────
	// @ts-expect-error the avatar is { id }: janus stores the id, nothing else
	await one.avatar.set('user-id', {});

	// ── 104. An id that is no string ────────────────────────────────────
	// @ts-expect-error the id is the string the application chose, not a number
	await one.avatar.set('user-id', { id: 42 });

	// ── 105. A remove that is given an avatar ───────────────────────────
	// @ts-expect-error remove takes the user, and options: there is nothing to say about what goes
	await one.avatar.remove('user-id', { id: 'former' });

	// ── 106. A user type named avatar ───────────────────────────────────
	janus({
		users: {
			// @ts-expect-error avatar is the root's own, beside each type's: a type cannot take the name
			avatar: { schema: z.object({ name: z.string() }) },
		},
		store,
	});

	// ── 107. A schema declaring avatar ──────────────────────────────────
	janus({
		// @ts-expect-error avatar is janus's own field: a schema cannot declare it
		user: z.object({ email: z.email(), avatar: z.string() }),
		password: { login: 'email' },
		store,
		hasher,
	});
}

// ── And the shapes that MUST keep compiling ─────────────────────────────────

async function allowed() {
	// A type's own avatar answers its own users; the root's, any of them.
	const patient = await clinic.patient.avatar.set('id', { id: 'img-1' });
	const type: 'patient' = patient.type;
	const former: { id: string; updatedAt: Date } | null = patient.avatar;
	const anyone = await clinic.avatar.remove({ id: 'id' }, { ifVersion: 3 });
	const which: 'patient' | 'staff' | 'guest' = anyone.type;
	// One type keeps it at the root.
	const single = await one.avatar.set('id', { id: 'img-2' });
	return [type, former, which, single.avatar];
}

export const checked = { avatar, allowed };
