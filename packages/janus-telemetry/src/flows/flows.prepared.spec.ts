import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus(), a request in two steps', () => {
	it('traces prepare and its send, and writes what request writes — never the token or the challenge', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		const secrets: string[] = [];
		const { spans, logs } = await collect(async () => {
			const link = await auth.patient.magicLink.prepare(email);
			const code = await auth.patient.signInCode.prepare(email);
			const issuedLink = await link.send();
			const issuedCode = await code.send();
			const nobody = await auth.patient.magicLink.prepare(
				'nobody@example.test',
			);
			expect(await nobody.send()).toBeNull();
			if (issuedLink === null || issuedCode === null) {
				throw new Error('expected a link and a code');
			}
			secrets.push(issuedLink.token, code.challenge, issuedCode.code);
		});

		const names = spans.map((span) => span.name);
		expect(names).toContain('janus.patient.magicLink.prepare');
		expect(names).toContain('janus.patient.magicLink.prepare.send');
		expect(names).toContain('janus.patient.signInCode.prepare.send');
		const sent = logs.filter((log) =>
			['janus.magicLink.sent', 'janus.signInCode.sent'].includes(log.name),
		);
		expect(sent.map((log) => [log.name, log.attributes['user.id']])).toEqual([
			['janus.magicLink.sent', user.id],
			['janus.signInCode.sent', user.id],
		]);
		const written = JSON.stringify({ spans, logs });
		for (const secret of secrets) expect(written).not.toContain(secret);
		expect(written).not.toContain(email);
	});

	it.each(['magicLink', 'signInCode', 'resetPassword'] as const)(
		'warns janus.mail.throttled for %s.prepare',
		async (flow) => {
			const { auth } = setup();
			const prepare = (): Promise<unknown> => auth.patient[flow].prepare(email);
			for (let at = 0; at < 5; at += 1) await prepare();

			const { logs } = await collect(async () => {
				expect(await rejection(prepare())).toMatchObject({
					code: 'MAIL_THROTTLED',
				});
			});

			const throttled = logs.filter(
				(log) => log.name === 'janus.mail.throttled',
			);
			expect(throttled).toHaveLength(1);
			expect(throttled[0]?.attributes).toMatchObject({
				'janus.mail.flow': `${flow}.prepare`,
				'janus.user.type': 'patient',
			});
		},
	);

	it('keeps send single-use through the trace', async () => {
		const { auth } = setup();
		const pending = await auth.patient.magicLink.prepare(email);
		await pending.send();

		expect(await rejection(pending.send())).toBeInstanceOf(TypeError);
	});

	it('keeps signUp callable and traces signUp.prepare, its send and the throttle', async () => {
		const { auth } = setup();
		const { spans, logs } = await collect(async () => {
			const pending = await auth.patient.signUp.prepare({ email, password });
			expect(await pending.send()).toMatchObject({ status: 'created' });
			for (let at = 0; at < 4; at += 1) {
				await auth.patient.signUp.prepare({ email, password });
			}
			expect(
				await rejection(auth.patient.signUp.prepare({ email, password })),
			).toMatchObject({ code: 'MAIL_THROTTLED' });
		});

		const names = spans.map((span) => span.name);
		expect(names).toContain('janus.patient.signUp.prepare');
		expect(names).toContain('janus.patient.signUp.prepare.send');
		expect(
			logs.filter((log) => log.name === 'janus.mail.throttled'),
		).toHaveLength(1);
		const { user } = await auth.patient.signUp({
			email: 'other@example.test',
			password,
		});
		expect(user.email).toBe('other@example.test');
	});
});
