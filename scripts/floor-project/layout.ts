import { cp, mkdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { versionFrom } from './copies';

/** What a package directory holds that the install or the build made. */
const MADE = new Set(['node_modules', 'dist']);

/**
 * Copies the package's directory into `<project>/packages/<name>`, leaving
 * out its `node_modules` and `dist/`, and the root's `tsconfig.base.json`
 * beside it, so its `tsconfig.json` extends the same file by the same
 * relative path and its specs import the same relative paths. Returns the
 * copy's directory.
 */
export async function layOut(
	root: string,
	pkgDir: string,
	project: string,
): Promise<string> {
	const copy = join(project, relative(root, pkgDir));
	await mkdir(copy, { recursive: true });
	await cp(pkgDir, copy, {
		recursive: true,
		filter: (source) => {
			const [top] = relative(pkgDir, source).split(sep);
			return top === undefined || !MADE.has(top);
		},
	});
	const base = Bun.file(join(root, 'tsconfig.base.json'));
	if (await base.exists()) {
		await Bun.write(join(project, 'tsconfig.base.json'), base);
	}
	return copy;
}

/**
 * The exact version each name resolves to from `pkgDir` in the workspace —
 * what `bun.lock` holds — so the project runs the specs on the same test
 * libraries as the `ci` job, and only the floors differ.
 */
export async function lockedVersions(
	pkgDir: string,
	names: readonly string[],
): Promise<Record<string, string>> {
	const versions: Record<string, string> = {};
	for (const name of names) {
		const version = await versionFrom(pkgDir, name);
		if (version === undefined) {
			throw new Error(
				`${name} does not resolve from ${pkgDir}; run bun install`,
			);
		}
		versions[name] = version;
	}
	return versions;
}
