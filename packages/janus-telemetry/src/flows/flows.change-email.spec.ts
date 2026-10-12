import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

const moved = 'ada.new@example.test';

describe('instrumentJanus(), a changed e-mail', () => {
	it('writes janus.email.changed with the user on confirm — never an address, a token, nor janus.email.verified', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		const secrets: string[] = [];
		const { spans, logs } = await collect(async () => {
			const issued = await auth.patient.changeEmail.send(user, moved);
			await auth.patient.changeEmail.confirm(issued.token);
			secrets.push(issued.token);
		});

		const changed = logs.filter((log) => log.name === 'janus.email.changed');
		expect(changed).toHaveLength(1);
		expect(changed[0]?.severity).toBe('info');
		expect(changed[0]?.attributes).toMatchObject({
			'janus.user.type': 'patient',
			'user.id': user.id,
			'janus.email.proved': true,
		});
		expect(logs.some((log) => log.name === 'janus.email.verified')).toBe(false);
		expect(
			spans.find((span) => span.name === 'janus.patient.changeEmail.confirm')
				?.attributes['user.id'],
		).toBe(user.id);
		const written = JSON.stringify({ spans, logs });
		for (const secret of [email, moved, ...secrets]) {
			expect(written).not.toContain(secret);
		}
	});

	it('writes janus.email.changed with proved=false for an update whose patch names the e-mail — never the address', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		const { spans, logs } = await collect(async () => {
			await auth.patient.update(user, { email: moved });
		});

		const changed = logs.filter((log) => log.name === 'janus.email.changed');
		expect(changed).toHaveLength(1);
		expect(changed[0]?.attributes).toMatchObject({
			'janus.user.type': 'patient',
			'user.id': user.id,
			'janus.email.proved': false,
		});
		const written = JSON.stringify({ spans, logs });
		for (const address of [email, moved]) {
			expect(written).not.toContain(address);
		}
	});

	it('writes no janus.email.changed for an update whose patch leaves the e-mail out, nor for a refused one', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		await auth.patient.signUp({ email: moved, password });
		const { logs } = await collect(async () => {
			await auth.patient.update(user, {});
			await rejection(auth.patient.update(user, { email: moved }));
		});

		expect(logs.map((log) => log.name)).toEqual([]);
	});

	it('writes nothing for a send under the limit, nor for a refused confirm', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		const { logs } = await collect(async () => {
			await auth.patient.changeEmail.send(user, moved);
			await rejection(auth.patient.changeEmail.confirm('not-a-token'));
		});

		expect(logs.map((log) => log.name)).toEqual([]);
	});

	it('warns janus.mail.throttled for send past its attempts, with the flow and the user — never the address', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		for (let at = 0; at < 5; at += 1) {
			await auth.patient.changeEmail.send(user, moved);
		}
		const { spans, logs } = await collect(async () => {
			await rejection(auth.patient.changeEmail.send(user, moved));
		});

		const throttled = logs.filter((log) => log.name === 'janus.mail.throttled');
		expect(throttled).toHaveLength(1);
		expect(throttled[0]?.attributes).toMatchObject({
			'janus.refusal': 'MAIL_THROTTLED',
			'janus.mail.flow': 'changeEmail.send',
			'user.id': user.id,
		});
		const written = JSON.stringify({ spans, logs });
		for (const address of [email, moved]) {
			expect(written).not.toContain(address);
		}
	});

	it('names the asking user when the new address was exhausted by others', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		for (let at = 0; at < 5; at += 1) {
			const other = await auth.patient.signUp({
				email: `other${at}@example.test`,
				password,
			});
			await auth.patient.changeEmail.send(other.user, moved);
		}
		const { logs } = await collect(async () => {
			await rejection(auth.patient.changeEmail.send(user, moved));
		});

		expect(
			logs.find((log) => log.name === 'janus.mail.throttled')?.attributes,
		).toMatchObject({
			'janus.mail.flow': 'changeEmail.send',
			'user.id': user.id,
		});
	});
});
