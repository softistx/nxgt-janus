/**
 * The built artifact, as a consumer loads it: `dist/index.js`, with the
 * e-mails inlined. Run after `bun run build`, as CI does.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixedClock } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { issuedAt, links, signIn } from '../test/setup';

const PACKAGE_DIR = join(import.meta.dir, '..');

/** A copy of `dist/` alone, under `node_modules/` so its imports still resolve. */
const bare = await mkdtemp(join(PACKAGE_DIR, 'node_modules', '.artifact-'));
await cp(join(PACKAGE_DIR, 'dist'), join(bare, 'dist'), { recursive: true });

afterAll(() => rm(bare, { recursive: true, force: true }));

describe('the built artifact', () => {
	test('renders a default e-mail', async () => {
		const { janusMail } = await import('../dist/index');
		const mailer = createMemoryMailer();
		await janusMail({
			mailer,
			from: 'noreply@acme.example',
			brand: 'Acme',
			links,
			clock: fixedClock(issuedAt),
		}).signInCode(signIn, { locale: 'fr' });
		const [sent] = mailer.sent;
		expect(sent?.subject).toBe('Votre code de connexion : 042817');
		expect(sent?.html).toContain('Acme');
		expect(sent?.html).not.toContain('{{');
	});

	test('dist/ alone, with no mails/ anywhere, still renders: the e-mails are inlined', async () => {
		const { janusMail } = await import(join(bare, 'dist', 'index.js'));
		const mailer = createMemoryMailer();
		await janusMail({
			mailer,
			from: 'noreply@acme.example',
			brand: 'Acme',
			links,
			clock: fixedClock(issuedAt),
		}).signInCode(signIn);
		expect(mailer.sent).toHaveLength(1);
	});
});
