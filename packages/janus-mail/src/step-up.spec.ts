import { describe, expect, test } from 'bun:test';
import {
	createMemoryStores,
	fixedClock,
	janus,
	scryptHasher,
} from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { z } from 'zod';
import { baseOptions, links, partsOf, rejection, stepUp } from '../test/setup';
import { janusMail } from './janus-mail';

const security = 'https://acme.example/account/security';

describe('stepUp', () => {
	test('sends the code to issued.email in English, never the challenge', async () => {
		const options = baseOptions();
		await janusMail(options).stepUp(stepUp, { name: 'Ada' });

		const sent = options.mailer.sent[0];
		expect(sent?.to).toBe('ada@example.com');
		expect(sent?.subject).toBe('Your confirmation code');
		expect(sent?.text).toContain('Hello Ada,');
		expect(sent?.text).toContain('315062');
		expect(sent?.text).toContain('This code expires in 1 hour.');
		expect(sent?.html).toContain(`href="${security}"`);
		expect(sent?.text).toContain(security);
		for (const part of partsOf(sent)) {
			expect(part).not.toContain('STEP-UP-CHALLENGE');
		}
	});

	test('in French for a recipient who wants fr-CA', async () => {
		const options = baseOptions();
		await janusMail(options).stepUp(stepUp, { name: 'Ada', locale: 'fr-CA' });

		const sent = options.mailer.sent[0];
		expect(sent?.subject).toBe('Votre code de confirmation');
		expect(sent?.text).toContain('Bonjour Ada,');
		// `Intl` may put a no-break space between the number and the unit.
		expect(sent?.text).toMatch(/Ce code expire dans 1\s+heure\./);
		expect(sent?.text).toContain('Sécuriser mon compte');
	});

	test('with the expiry the send passes', async () => {
		const options = baseOptions();
		await janusMail(options).stepUp(
			stepUp,
			{ name: 'Ada', locale: 'fr' },
			{ expiresIn: 'dix minutes' },
		);
		expect(options.mailer.sent[0]?.text).toContain('dix minutes');
	});

	test("refuses a step-up confirmed with the user's app, and sends nothing", async () => {
		const options = baseOptions();
		const byApp = {
			via: 'secondFactor',
			challenge: 'c',
			expiresAt: stepUp.expiresAt,
			user: { id: 'u1' },
		};

		const error = await rejection(
			janusMail(options).stepUp(byApp as never, { name: 'Ada' }),
		);

		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			"janusMail.stepUp: via must be 'email' — a step-up confirmed with the user's app sends no e-mail",
		);
		expect(options.mailer.sent).toHaveLength(0);
	});

	test('refuses a missing name, a code that is not a string, and a link that is not one', async () => {
		const mail = janusMail(baseOptions());
		const asyncLink = janusMail({
			...baseOptions(),
			links: { ...links, secureAccount: (async () => 'x') as never },
		});

		expect(await rejection(mail.stepUp(stepUp, {} as never))).toMatchObject({
			message: 'janusMail.stepUp: name must be a string',
		});
		expect(
			await rejection(
				mail.stepUp({ ...stepUp, code: 315062 as never }, { name: 'Ada' }),
			),
		).toMatchObject({ message: 'janusMail.stepUp: code must be a string' });
		expect(
			await rejection(asyncLink.stepUp(stepUp, { name: 'Ada' })),
		).toMatchObject({
			message: 'janusMail.stepUp: links.secureAccount() must answer a string',
		});
	});

	test('refuses an expiresAt that is past', async () => {
		const mail = janusMail(baseOptions());
		const past = { ...stepUp, expiresAt: new Date('2026-09-27T10:00:00Z') };
		expect(await rejection(mail.stepUp(past, { name: 'Ada' }))).toMatchObject({
			message:
				'janusMail.stepUp: expiresAt is past — the link or code would not work',
		});
	});

	test('sends what auth.stepUp.request answered, and its code confirms', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 28, 9));
		const auth = janus({
			user: z.strictObject({ email: z.email() }),
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher: scryptHasher({ cost: 10 }), // the cheapest: one sign-up, one sign-in
			clock,
		});
		const mailer = createMemoryMailer();
		const mail = janusMail({ ...baseOptions(), mailer, clock });
		const password = 'correct horse battery staple';
		await auth.signUp({ email: 'ada@example.com', password });
		const { user, token } = await auth.signIn({
			email: 'ada@example.com',
			password,
		});

		// No second factor configured: the answer is StepUpByEmail, no narrowing.
		const issued = await auth.stepUp.request(user);
		await mail.stepUp(issued, { name: 'Ada', locale: 'fr' });

		const text = mailer.sent[0]?.text ?? '';
		expect(text).toContain('10 minutes');
		const code = /\b(\d{6})\b/.exec(text)?.[1] ?? '';
		const request = new Request('https://acme.example', {
			headers: { authorization: `Bearer ${token}` },
		});
		const session = await auth.stepUp.confirm(request, issued.challenge, code);
		expect(session.authenticatedAt).toEqual(clock.now());
	});
});
