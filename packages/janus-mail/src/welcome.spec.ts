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

// The welcome, wired as a consumer wires it: on `user.created`, the user read
// back by id — the event carries nothing else.

/** A `janus()` whose listener sends the welcome, over `baseOptions()`'s mailer. */
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
		hasher: scryptHasher(),
		async events(event: UserEvent) {
			if (event.type === 'user.created') {
				const user = await auth.get(event.userId);
				await mail.welcome({
					name: user.name,
					locale: user.locale,
					email: user.email,
				});
			}
		},
	});
	return { auth, mailer: options.mailer };
}

describe('welcome on user.created', () => {
	test('signUp welcomes the new user, in their locale, before it answers', async () => {
		const { auth, mailer } = wired();
		await auth.signUp({
			email: 'ada@example.com',
			name: 'Ada',
			locale: 'fr',
			password: 'correct horse battery staple',
		});
		expect(mailer.sent).toHaveLength(1);
		const [sent] = mailer.sent;
		expect(sent?.to).toBe('ada@example.com');
		expect(sent?.subject).toBe('Bienvenue, Ada');
		expect(sent?.html).toContain('lang="fr"');
		expect(sent?.text).toContain('https://acme.example/start');
	});

	test('create welcomes a user someone else created', async () => {
		const { auth, mailer } = wired();
		await auth.create({
			email: 'grace@example.com',
			name: 'Grace',
			locale: 'en',
		});
		expect(mailer.sent.map((sent) => [sent.to, sent.subject])).toEqual([
			['grace@example.com', 'Welcome, Grace'],
		]);
	});

	test('a failed welcome fails no sign-up: it is a JANUS_EVENT_FAILED warning', async () => {
		const { auth, mailer } = wired();
		mailer.failNext(new MailFailure('send: the provider could not be reached'));
		const warnings: (Error & { code?: string })[] = [];
		const onWarning = (warning: Error) => warnings.push(warning);
		process.on('warning', onWarning);
		try {
			const { user } = await auth.signUp({
				email: 'ada@example.com',
				name: 'Ada',
				locale: 'en',
				password: 'correct horse battery staple',
			});
			expect(user.email).toBe('ada@example.com');
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
