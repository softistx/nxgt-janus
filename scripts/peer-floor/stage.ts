import { mkdir, readdir, realpath, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface FloorManifest {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
	readonly peerDependenciesMeta?: Readonly<
		Record<string, { readonly optional?: boolean }>
	>;
}

/**
 * What the floor needs and the staged directory does not give it: a
 * dependency or a required peer that is missing, or any one staged at a
 * version outside the floor's range. `staged` maps a name to its version.
 * Pure.
 */
export function unmet(
	floor: FloorManifest,
	staged: Readonly<Record<string, string | undefined>>,
): string[] {
	const ranges = { ...floor.dependencies, ...floor.peerDependencies };
	const problems: string[] = [];
	for (const [name, range] of Object.entries(ranges)) {
		const version = staged[name];
		if (version === undefined) {
			if (!floor.peerDependenciesMeta?.[name]?.optional) {
				problems.push(`${name} ${range} is not installed beside it`);
			}
		} else if (!Bun.semver.satisfies(version, range)) {
			problems.push(`${name} ${version} is outside its range ${range}`);
		}
	}
	return problems;
}

async function manifestAt(path: string): Promise<FloorManifest | undefined> {
	const file = Bun.file(join(path, 'package.json'));
	return (await file.exists()) ? file.json() : undefined;
}

/**
 * Unpacks `tarball` into `<dir>/node_modules/<name>`, beside absolute links
 * to everything else in `lockedModules` — the `node_modules` Bun's isolated
 * install gave the locked copy, which holds its dependencies and peers — and
 * refuses unless those satisfy the floor's own ranges. Returns the unpacked
 * directory.
 */
export async function stage(
	name: string,
	tarball: Uint8Array,
	lockedModules: string,
	dir: string,
): Promise<string> {
	const modules = join(dir, 'node_modules');
	const target = join(modules, name);
	await mkdir(target, { recursive: true });
	const file = join(dir, 'floor.tgz');
	await Bun.write(file, tarball);
	const tar = Bun.spawn(
		['tar', '-xzf', file, '-C', target, '--strip-components=1'],
		{ stdio: ['ignore', 'inherit', 'inherit'] },
	);
	if ((await tar.exited) !== 0) throw new Error(`tar could not unpack ${name}`);

	const staged: Record<string, string | undefined> = {};
	const link = async (entry: string) => {
		const at = join(modules, entry);
		await mkdir(dirname(at), { recursive: true });
		await symlink(await realpath(join(lockedModules, entry)), at);
		staged[entry] = ((await manifestAt(at)) as { version?: string })?.version;
	};
	for (const entry of await readdir(lockedModules)) {
		if (entry.startsWith('.')) continue;
		if (!entry.startsWith('@')) {
			await link(entry);
			continue;
		}
		for (const inner of await readdir(join(lockedModules, entry))) {
			if (`${entry}/${inner}` !== name) await link(`${entry}/${inner}`);
		}
	}

	const problems = unmet((await manifestAt(target)) ?? {}, staged);
	if (problems.length > 0) {
		throw new Error(
			`${name}'s floor cannot run beside the locked peers: ${problems.join('; ')}`,
		);
	}
	return target;
}
