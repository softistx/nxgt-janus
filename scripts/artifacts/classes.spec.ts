import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { duplicateClasses } from './classes';

describe('duplicateClasses — the highest packaging risk in AGENTS.md', () => {
	test('finds a class defined in two entry bundles', () => {
		expect(
			duplicateClasses([
				[
					'index.js',
					'class JanusError extends Error {}\nclass StoreFailure {}',
				],
				['identities/index.js', 'class StoreFailure {}'],
			]),
		).toEqual([['StoreFailure', ['index.js', 'identities/index.js']]]);
	});

	test('does not count a shared chunk: that is the fix, not the symptom', () => {
		expect(
			duplicateClasses([
				['chunks/errors-abc.js', 'class StoreFailure {}'],
				['index.js', 'import "./chunks/errors-abc.js";'],
				['identities/index.js', 'import "../chunks/errors-abc.js";'],
			]),
		).toEqual([]);
	});

	test('reads only definitions at the start of a line, not a mention', () => {
		expect(
			duplicateClasses([
				['a.js', 'class Thing {}'],
				['b.js', '// the class Thing lives in a.js\nconst x = new Thing();'],
			]),
		).toEqual([]);
	});

	test('catches what Bun.build does without splitting, and passes what it does with it', async () => {
		// Measured, not assumed: two entry points sharing one class module.
		const dir = await mkdtemp(join(tmpdir(), 'janus-splitting-'));
		await writeFile(
			join(dir, 'errors.ts'),
			'export class StoreFailure extends Error {}\n',
		);
		await writeFile(
			join(dir, 'a.ts'),
			"export { StoreFailure } from './errors';\n",
		);
		await writeFile(
			join(dir, 'b.ts'),
			"export { StoreFailure } from './errors';\n",
		);

		const bundles = async (splitting: boolean) => {
			const out = join(dir, splitting ? 'split' : 'inline');
			const result = await Bun.build({
				entrypoints: [join(dir, 'a.ts'), join(dir, 'b.ts')],
				outdir: out,
				splitting,
				naming: { chunk: 'chunks/[name]-[hash].[ext]' },
			});
			expect(result.success).toBe(true);
			const files: [string, string][] = [];
			for await (const rel of new Bun.Glob('**/*.js').scan({ cwd: out })) {
				files.push([rel, await Bun.file(join(out, rel)).text()]);
			}
			return files;
		};

		expect(duplicateClasses(await bundles(false)).map(([cls]) => cls)).toEqual([
			'StoreFailure',
		]);
		expect(duplicateClasses(await bundles(true))).toEqual([]);
	});
});
