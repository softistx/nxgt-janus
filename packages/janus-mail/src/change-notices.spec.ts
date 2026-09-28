import { describe, expect, test } from 'bun:test';
import {
	createMemoryStores,
	janus,
	scryptHasher,
	type UserEvent,
} from '@nxgt/janus';
import { MailFailure } from '@nxgt/mail';
import { z } from 'zod';
import { baseOptions } from '../test/setup';
import { janusMail } from './janus-mail';

// The notices of a change, wired as a consumer wires them: on
// `user.passwordChanged` the user read back by id; on `user.emailChanged` the
// notice sent to `event.formerEmail`, the one address the user no longer has.

const password = 'correct horse battery staple';

/** A `janus()` whose listener sends both notices, over `baseOptions()`'s mailer. */
function wired() {
	const options = baseOptions();
	const mail = janusMail(options);
	const auth = janus({
		user: z.strictObject({
			email: z.email(),
			name: z.string(),
			locale: z.string(),
		}),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }),
		async events(event: UserEvent) {
			if (event.type === 'user.passwordChanged') {
				const user = await auth.get(event.userId);
				await mail.passwordChanged({
					name: user.name,
					locale: user.locale,
					email: user.email,
				});
			}
			if (event.type === 'user.emailChanged' && event.formerEmail != null) {
				const user = await auth.get(event.userId);
				await mail.emailChanged({
					name: user.name,
					locale: user.locale,
					formerEmail: event.formerEmail,
					newEmail: user.email,
				});
			}
		},
	});
	return { auth, mailer: options.mailer };
}

async function signedUp(auth: ReturnType<typeof wired>['auth']) {
	const { user } = await auth.signUp({
		email: 'ada@example.com',
		name: 'Ada',
		locale: 'fr',
		password,
	});
	return user;
}

describe('change notices on user.passwordChanged and user.emailChanged', () => {
	test('changePassword and setPassword each tell the user, in their locale, before they answer', async () => {
		const { auth, mailer } = wired();
		const user = await signedUp(auth);

		await auth.changePassword(user, { current: password, next: 'a new one!' });
		await auth.setPassword(user, 'another new one');

		expect(mailer.sent).toHaveLength(2);
		for (const sent of mailer.sent) {
			expect(sent.to).toBe('ada@example.com');
			expect(sent.html).toContain('lang="fr"');
			expect(sent.text).toContain('https://acme.example/account/security');
		}
	});

	test('a reset sends no password-changed notice: it is user.passwordReset', async () => {
		const { auth, mailer } = wired();
		await signedUp(auth);

		const issued = await auth.resetPassword.request('ada@example.com');
		await auth.resetPassword.confirm(issued?.token ?? '', 'a new one!');

		expect(mailer.sent).toEqual([]);
	});

	test('an e-mail changed is told to the former address, naming the new one', async () => {
		const { auth, mailer } = wired();
		const user = await signedUp(auth);

		await auth.update(user, { email: 'ada@new.example', locale: 'en' });

		expect(mailer.sent).toHaveLength(1);
		const [sent] = mailer.sent;
		expect(sent?.to).toBe('ada@example.com');
		expect(sent?.html).toContain('lang="en"');
		expect(sent?.text).toContain('ada@new.example');
		expect(sent?.text).toContain('https://acme.example/account/security');
	});

	test('an update that leaves the e-mail alone sends nothing', async () => {
		const { auth, mailer } = wired();
		const user = await signedUp(auth);

		await auth.update(user, { name: 'Ada King' });

		expect(mailer.sent).toEqual([]);
	});

	test('a failed notice fails no update: it is a JANUS_EVENT_FAILED warning', async () => {
		const { auth, mailer } = wired();
		const user = await signedUp(auth);
		mailer.failNext(new MailFailure('send: the provider could not be reached'));
		const warnings: (Error & { code?: string })[] = [];
		const onWarning = (warning: Error) => warnings.push(warning);
		process.on('warning', onWarning);
		try {
			const updated = await auth.update(user, { email: 'ada@new.example' });
			expect(updated.email).toBe('ada@new.example');
			expect(mailer.sent).toEqual([]);
			// Warnings are emitted on the next tick.
			await new Promise((resolve) => setImmediate(resolve));
			expect(warnings.map((warning) => warning.code)).toEqual([
				'JANUS_EVENT_FAILED',
			]);
		} finally {
			process.off('warning', onWarning);
		}
	});
});
