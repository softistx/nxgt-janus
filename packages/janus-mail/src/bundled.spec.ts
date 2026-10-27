/**
 * The package bundled into a consumer's own server file by `bun build`, where
 * `import.meta.url` is the bundle's and no `mails/` sits beside it: the default
 * e-mails still render, because they are inlined in the JavaScript.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = join(import.meta.dir, 'index.ts');
const root = await mkdtemp(join(tmpdir(), 'janus-mail-bundled-'));

afterAll(() => rm(root, { recursive: true, force: true }));

describe('the package bundled into an application', () => {
	test('renders a default e-mail with no mails/ beside the bundle', async () => {
		const app = join(root, 'a', 'b');
		await mkdir(app, { recursive: true });
		const entry = join(app, 'entry.ts');
		await writeFile(
			entry,
			`import { janusTemplates } from ${JSON.stringify(SOURCE)};
const { subject, html, text } = janusTemplates().signInCode({
	brand: 'Acme',
	code: '042817',
	expiresIn: '10 minutes',
	locale: 'fr',
});
console.log(JSON.stringify({ subject, html, text }));
`,
		);
		const built = Bun.spawnSync(
			['bun', 'build', entry, '--outdir', join(app, 'out'), '--target', 'bun'],
			{ cwd: join(import.meta.dir, '..'), stderr: 'pipe' },
		);
		expect(built.stderr.toString()).not.toContain('error');
		expect(built.exitCode).toBe(0);

		const run = Bun.spawnSync(['bun', join(app, 'out', 'entry.js')], {
			cwd: root,
			stderr: 'pipe',
		});
		expect(run.stderr.toString()).toBe('');
		expect(run.exitCode).toBe(0);
		const sent = JSON.parse(run.stdout.toString());
		expect(sent.subject).toMatch(/^Votre code de connexion\s*:\s*042817$/);
		expect(sent.html).toContain('Acme');
		expect(sent.html).not.toContain('{{');
	}, 30_000);
});
