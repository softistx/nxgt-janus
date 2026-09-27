/**
 * The built artifact, as a consumer loads it: `dist/index.js` resolving
 * `../mails/` from where it sits. Run after `bun run build`, as CI does.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createMemoryMailer } from '@nxgt/mail';
import { links, signIn } from '../test/setup';

const PACKAGE_DIR = join(import.meta.dir, '..');

/** A copy of `dist/` alone, under `node_modules/` so its imports still resolve. */
const bare = await mkdtemp(join(PACKAGE_DIR, 'node_modules', '.artifact-'));
await cp(join(PACKAGE_DIR, 'dist'), join(bare, 'dist'), { recursive: true });

afterAll(() => rm(bare, { recursive: true, force: true }));

describe('the built artifact', () => {
	test('renders a default e-mail from the mails/ shipped beside dist/', async () => {
		const { janusMail } = await import('../dist/index');
		const mailer = createMemoryMailer();
		await janusMail({
			mailer,
			from: 'noreply@acme.example',
			brand: 'Acme',
			links,
		}).signInCode(signIn, { locale: 'fr' });
		const [sent] = mailer.sent;
		expect(sent?.subject).toBe('Votre code de connexion : 042817');
		expect(sent?.html).toContain('Acme');
		expect(sent?.html).not.toContain('{{');
	});

	test('importing reads nothing: without mails/, only the first default e-mail fails', async () => {
		const { janusMail } = await import(join(bare, 'dist', 'index.js'));
		const mailer = createMemoryMailer();
		const mail = janusMail({
			mailer,
			from: 'noreply@acme.example',
			brand: 'Acme',
			links,
		});
		const error = await mail.signInCode(signIn).then(
			() => null,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toStartWith('createMailRenderer: ');
		expect(mailer.attempts).toBe(0);
	});
});
