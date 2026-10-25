import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('writes an avatar set and removed with the user, and never the avatar id', async () => {
		const { auth } = setup();
		const secretId = 'image-id-that-must-not-leak';
		let id = '';
		const { logs, all } = await collect(async () => {
			const user = await auth.patient.create({ email: 'ada@example.test' });
			id = user.id;
			await auth.patient.avatar.set(user, { id: secretId });
			await auth.patient.avatar.remove(user);
			await rejection(auth.patient.avatar.set(user, { id: '' }));
		});

		const written = logs.filter((log) => log.name.startsWith('janus.avatar.'));
		expect(written.map((log) => [log.name, log.attributes])).toEqual([
			['janus.avatar.set', { 'janus.user.type': 'patient', 'user.id': id }],
			['janus.avatar.removed', { 'janus.user.type': 'patient', 'user.id': id }],
		]);
		expect(JSON.stringify(all)).not.toContain(secretId);
	});

	it('names an avatar id that is refused as a refusal, and writes no avatar event', async () => {
		const { auth } = setup();
		const refused = 'x'.repeat(513);
		const { logs, spans, all } = await collect(async () => {
			const { id } = await auth.patient.create({ email: 'ada@example.test' });
			await rejection(auth.patient.avatar.set(id, { id: refused }));
		});

		expect(logs.some((log) => log.name.startsWith('janus.avatar.'))).toBe(
			false,
		);
		expect(
			spans.find((span) => span.name === 'janus.patient.avatar.set')
				?.attributes['janus.refusal'],
		).toBe('AVATAR_ID_INVALID');
		expect(JSON.stringify(all)).not.toContain(refused);
	});

	it('writes the user type of the answer when called at the root', async () => {
		const { auth } = setup();
		let id = '';
		const { logs } = await collect(async () => {
			const staff = await auth.staff.create({ username: 'sam' });
			id = staff.id;
			await auth.avatar.set(staff.id, { id: 'img-1' });
			await auth.avatar.remove(staff.id);
		});

		const written = logs.filter((log) => log.name.startsWith('janus.avatar.'));
		expect(written.map((log) => [log.name, log.attributes])).toEqual([
			['janus.avatar.set', { 'janus.user.type': 'staff', 'user.id': id }],
			['janus.avatar.removed', { 'janus.user.type': 'staff', 'user.id': id }],
		]);
	});
});
