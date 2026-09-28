import { readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { Floor } from './plan';

async function versionAt(dir: string): Promise<string | undefined> {
	const file = Bun.file(join(dir, 'package.json'));
	if (!(await file.exists())) return undefined;
	return ((await file.json()) as { version?: string }).version;
}

/**
 * The directory `name` resolves to from `from`, as Node and Bun resolve a
 * bare name: the first `node_modules/<name>` walking up. It reads no
 * `exports`, which a `<name>/package.json` specifier would need.
 */
export async function resolveFrom(
	from: string,
	name: string,
): Promise<string | undefined> {
	for (let dir = from; ; dir = dirname(dir)) {
		const at = join(dir, 'node_modules', name);
		if ((await versionAt(at)) !== undefined) return at;
		if (dirname(dir) === dir) return undefined;
	}
}

/** The version `name` resolves to from `from`, if it resolves. */
export async function versionFrom(
	from: string,
	name: string,
): Promise<string | undefined> {
	const at = await resolveFrom(from, name);
	return at === undefined ? undefined : versionAt(at);
}

/** The package directories directly under a `node_modules`, scoped or not. */
async function packagesIn(modules: string): Promise<string[]> {
	const entries = await readdir(modules, { withFileTypes: true }).catch(
		() => [],
	);
	const dirs: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
		const at = join(modules, entry.name);
		if (!entry.name.startsWith('@')) {
			dirs.push(at);
			continue;
		}
		for (const inner of await readdir(at, { withFileTypes: true })) {
			if (inner.isDirectory()) dirs.push(join(at, inner.name));
		}
	}
	return dirs;
}

/**
 * Every copy of `name` a hoisted install holds under `root`: the top-level
 * one and each nested under another package's `node_modules`, with its
 * version. Links are not followed; a hoisted install makes none but `.bin`.
 */
export async function copiesOf(
	root: string,
	name: string,
): Promise<{ readonly path: string; readonly version: string }[]> {
	const copies: { path: string; version: string }[] = [];
	const walk = async (modules: string): Promise<void> => {
		for (const dir of await packagesIn(modules)) {
			if (relative(modules, dir) === name) {
				const version = await versionAt(dir);
				if (version !== undefined) {
					copies.push({ path: relative(root, dir), version });
				}
			}
			await walk(join(dir, 'node_modules'));
		}
	};
	await walk(join(root, 'node_modules'));
	return copies.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * What the install got wrong: a floor held single with other than exactly
 * one copy, at the floor's version, or a floor that one of `from` — the
 * copied sources, the packed package — resolves at another version.
 */
export async function installProblems(
	root: string,
	from: readonly string[],
	floors: readonly Floor[],
	single: readonly string[],
): Promise<string[]> {
	const problems: string[] = [];
	for (const name of single) {
		const copies = await copiesOf(root, name);
		const floor = floors.find((each) => each.name === name);
		const [only] = copies;
		if (copies.length !== 1 || only?.version !== floor?.version) {
			const found = copies.map((c) => `${c.version} at ${c.path}`);
			problems.push(
				`${name}: one copy at ${floor?.version} expected, found ${found.join(', ') || 'none'}`,
			);
		}
	}
	for (const dir of from) {
		for (const { name, version } of floors) {
			const resolved = await versionFrom(dir, name);
			if (resolved !== version) {
				problems.push(
					`${relative(root, dir) || '.'} resolves ${name} ${resolved ?? 'nowhere'}, not ${version}`,
				);
			}
		}
	}
	return problems;
}
