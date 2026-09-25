import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * One kit, one subpath per database, and **neither loads the other's
 * driver**: an application on MongoDB installs no Drizzle, one on PostgreSQL
 * no `mongodb` — their peers are optional. That is a promise in the README,
 * so it is measured here: the runtime imports of each entry point, read from
 * the source. A type-only import is erased at build time and loads nothing,
 * so it is not followed.
 */

const SRC = import.meta.dir;
const transpiler = new Bun.Transpiler({ loader: 'ts' });

/** Every package an entry point loads at run time, and its own files. */
async function loads(entry: string) {
	const files = new Set<string>();
	const packages = new Set<string>();
	const visit = async (file: string): Promise<void> => {
		if (files.has(file)) return;
		files.add(file);
		for (const { path } of transpiler.scanImports(
			await Bun.file(file).text(),
		)) {
			if (!path.startsWith('.')) {
				packages.add(path);
				continue;
			}
			const base = join(dirname(file), path);
			const next = [`${base}.ts`, join(base, 'index.ts')].find(existsSync);
			if (next === undefined) {
				throw new Error(`${relative(SRC, file)}: cannot resolve ${path}`);
			}
			await visit(next);
		}
	};
	await visit(join(SRC, entry));
	return {
		files: [...files].map((file) => relative(SRC, file)).sort(),
		packages: [...packages].sort(),
	};
}

const DRIZZLE = ['@nxgt/drizzle', '@nxgt/janus-drizzle', 'drizzle-orm'];
const MONGO = ['@nxgt/janus-mongo', '@nxgt/mongo', 'mongodb'];
const from = (packages: string[], names: string[]) =>
	packages.filter((name) =>
		names.some((root) => name === root || name.startsWith(`${root}/`)),
	);

describe('each subpath loads its own database only', () => {
	it('@nxgt/janus-kit/drizzle loads nothing of MongoDB', async () => {
		const { files, packages } = await loads('drizzle/index.ts');
		expect(from(packages, MONGO)).toEqual([]);
		expect(files.filter((file) => file.startsWith('mongo/'))).toEqual([]);
		// Measured, not vacuous: its own driver and the shared kit are there.
		expect(from(packages, DRIZZLE)).toContain('@nxgt/janus-drizzle');
		expect(files).toContain('shared/kit.ts');
	});

	it('@nxgt/janus-kit/mongo loads nothing of Drizzle', async () => {
		const { files, packages } = await loads('mongo/index.ts');
		expect(from(packages, DRIZZLE)).toEqual([]);
		expect(files.filter((file) => file.startsWith('drizzle/'))).toEqual([]);
		expect(from(packages, MONGO)).toContain('@nxgt/janus-mongo');
		expect(files).toContain('shared/kit.ts');
	});
});
