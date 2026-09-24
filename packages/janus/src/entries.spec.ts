import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Janus has two sides, and each is usable alone: **identities** — `janus()`,
 * from `@nxgt/janus` — and **permissions** — `@nxgt/janus/permissions`. What
 * they share is the vocabulary: errors, subjects, pagination, time, ids, and
 * the store guard.
 *
 * That is a promise in the README, so it is measured here rather than
 * claimed: the runtime import graph of each entry point, read from the
 * source, must stay out of the other side's directory. A type-only import is
 * erased at build time and loads nothing, so it is not followed.
 */

const SRC = import.meta.dir;
const transpiler = new Bun.Transpiler({ loader: 'ts' });

/** Every source file an entry point loads at run time, relative to `src/`. */
async function loads(entry: string): Promise<string[]> {
	const seen = new Set<string>();
	const visit = async (file: string): Promise<void> => {
		if (seen.has(file)) return;
		seen.add(file);
		for (const { path } of transpiler.scanImports(
			await Bun.file(file).text(),
		)) {
			if (!path.startsWith('.')) continue;
			const base = join(dirname(file), path);
			const next = [`${base}.ts`, join(base, 'index.ts')].find(existsSync);
			if (next === undefined) {
				throw new Error(`${relative(SRC, file)}: cannot resolve ${path}`);
			}
			await visit(next);
		}
	};
	await visit(join(SRC, entry));
	return [...seen].map((file) => relative(SRC, file)).sort();
}

const inside = (files: string[], dir: string) =>
	files.filter((file) => file.startsWith(`${dir}/`));

describe('each side of the package is usable alone', () => {
	it('@nxgt/janus/permissions loads no identity code', async () => {
		const files = await loads('permissions/index.ts');

		expect(inside(files, 'auth')).toEqual([]);
		// Measured, not vacuous: the engine and the guard are there.
		expect(files).toContain('permissions/engine.ts');
		expect(files).toContain('stores/guard.ts');
	});

	it('@nxgt/janus loads no permission engine', async () => {
		const files = await loads('index.ts');

		// The relation store's port is a type: janus({ relations }) takes one,
		// and a type loads nothing. The engine is never loaded.
		expect(inside(files, 'permissions')).toEqual([]);
		expect(files).toContain('auth/janus.ts');
	});

	it('follows a runtime import, and not a type-only one', async () => {
		expect(
			transpiler
				.scanImports(
					"import type { A } from './a';\nimport { b } from './b';\nexport type { C } from './c';",
				)
				.map(({ path }) => path),
		).toEqual(['./b']);
	});
});
