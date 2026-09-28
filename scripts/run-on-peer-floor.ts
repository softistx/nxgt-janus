#!/usr/bin/env bun
/**
 * Runs a command with an `@nxgt/*` peer at its floor instead of the version
 * `bun.lock` holds.
 *
 *     bun scripts/run-on-peer-floor.ts @nxgt/mongo@0.17.0 janus-mongo janus-kit -- bun test
 *
 * The packages here peer the nxgt `0.x` libraries by `>=<floor> <1`, and the
 * specs run on the locked version, which is npm's latest. The floor is the
 * other end of that promise, and the `floors` CI job runs it through this.
 *
 * Nothing it does is written to `package.json` or `bun.lock`. The floor's
 * tarball is fetched from npm, checked against the registry's integrity and
 * unpacked into a temporary directory, beside links to the same peers the
 * locked copy resolves (`mongodb`, `zod`, ...). Then each named package's
 * `node_modules/<name>` link, which Bun's isolated install made, is pointed at
 * it. Whatever the command does, the links are put back and the directory
 * removed afterwards — on an interrupt as well — so a later step, or the
 * developer's tree, is left as the install made it.
 *
 * The run fails before the command starts unless every named package
 * resolves `<name>/package.json` to the floor's version.
 */

import {
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readlink,
	realpath,
	rm,
	symlink,
	unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const REGISTRY = 'https://registry.npmjs.org';
const USAGE =
	'usage: run-on-peer-floor.ts <@scope/name>@<version> <package>... -- <command>...';

export interface Plan {
	readonly name: string;
	readonly version: string;
	/** Directories under `packages/` whose link to `name` is repointed. */
	readonly packages: readonly string[];
	readonly command: readonly string[];
}

/** Reads `<name>@<version> <package>... -- <command>...`. Pure; throws on misuse. */
export function parsePlan(argv: readonly string[]): Plan {
	const dash = argv.indexOf('--');
	const [spec, ...packages] = dash === -1 ? argv : argv.slice(0, dash);
	const command = dash === -1 ? [] : argv.slice(dash + 1);
	const at = spec?.lastIndexOf('@') ?? -1;
	if (!spec || at <= 0 || packages.length === 0 || command.length === 0) {
		throw new Error(USAGE);
	}
	const name = spec.slice(0, at);
	const version = spec.slice(at + 1);
	if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(name)) {
		throw new Error(`${name} is not a scoped package name. ${USAGE}`);
	}
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(`${version} is not an exact version. ${USAGE}`);
	}
	return { name, version, packages, command };
}

/** Whether `bytes` match an npm `sha512-<base64>` integrity. */
export function matchesIntegrity(
	integrity: string,
	bytes: Uint8Array,
): boolean {
	const [algorithm, expected] = integrity.split('-', 2);
	if (algorithm !== 'sha512' || !expected) return false;
	const hasher = new Bun.CryptoHasher('sha512');
	hasher.update(bytes);
	return hasher.digest('base64') === expected;
}

async function download(name: string, version: string): Promise<Uint8Array> {
	const meta = await fetch(`${REGISTRY}/${name}/${version}`);
	if (!meta.ok) throw new Error(`${name}@${version}: registry ${meta.status}`);
	const { dist } = (await meta.json()) as {
		dist: { tarball: string; integrity: string };
	};
	const tarball = await fetch(dist.tarball);
	if (!tarball.ok) {
		throw new Error(`${dist.tarball}: registry ${tarball.status}`);
	}
	const bytes = new Uint8Array(await tarball.arrayBuffer());
	if (!matchesIntegrity(dist.integrity, bytes)) {
		throw new Error(`${dist.tarball} does not match ${dist.integrity}`);
	}
	return bytes;
}

async function run(command: readonly string[], cwd = ROOT): Promise<number> {
	const child = Bun.spawn([...command], {
		cwd,
		stdio: ['inherit', 'inherit', 'inherit'],
	});
	return child.exited;
}

/**
 * Unpacks the floor into `<dir>/node_modules/<name>`, beside absolute links to
 * everything else in the locked copy's `node_modules` — its peers, as Bun's
 * isolated install linked them for it. Returns the unpacked directory.
 */
async function stage(plan: Plan, locked: string, dir: string): Promise<string> {
	const modules = join(dir, 'node_modules');
	const target = join(modules, plan.name);
	await mkdir(target, { recursive: true });
	const tarball = join(dir, 'floor.tgz');
	await Bun.write(tarball, await download(plan.name, plan.version));
	const status = await run(
		['tar', '-xzf', tarball, '-C', target, '--strip-components=1'],
		dir,
	);
	if (status !== 0) throw new Error(`tar exited ${status}`);

	// `.../node_modules/@nxgt/mongo` → `.../node_modules`, whose other entries
	// are the peers the locked copy resolves.
	const lockedModules = dirname(dirname(locked));
	const [scope] = plan.name.split('/');
	for (const entry of await readdir(lockedModules)) {
		if (entry === scope) {
			for (const inner of await readdir(join(lockedModules, entry))) {
				if (`${entry}/${inner}` === plan.name) continue;
				const from = await realpath(join(lockedModules, entry, inner));
				await symlink(from, join(modules, entry, inner));
			}
			continue;
		}
		if (entry.startsWith('.')) continue;
		const from = await realpath(join(lockedModules, entry));
		await symlink(from, join(modules, entry));
	}
	return target;
}

async function versionAt(path: string): Promise<string> {
	const manifest = (await Bun.file(join(path, 'package.json')).json()) as {
		version: string;
	};
	return manifest.version;
}

async function main(argv: readonly string[]): Promise<number> {
	const plan = parsePlan(argv);
	const links = plan.packages.map((pkg) =>
		join(ROOT, 'packages', pkg, 'node_modules', plan.name),
	);
	for (const link of links) {
		if (!(await lstat(link)).isSymbolicLink()) {
			throw new Error(`${link} is not a link; is the install isolated?`);
		}
	}
	const originals = await Promise.all(links.map((link) => readlink(link)));
	const dir = await mkdtemp(join(tmpdir(), 'peer-floor-'));
	const restore = async () => {
		for (const [index, link] of links.entries()) {
			await rm(link, { force: true });
			await symlink(originals[index] as string, link);
		}
		await rm(dir, { recursive: true, force: true });
	};
	const interrupted = () => {
		restore().finally(() => process.exit(130));
	};
	process.once('SIGINT', interrupted);
	process.once('SIGTERM', interrupted);

	try {
		const floor = await stage(plan, await realpath(links[0] as string), dir);
		for (const link of links) {
			await unlink(link);
			await symlink(floor, link);
			const found = await versionAt(link);
			if (found !== plan.version) {
				throw new Error(`${link} resolves ${found}, not ${plan.version}`);
			}
			console.log(`${link.slice(ROOT.length + 1)} → ${plan.name}@${found}`);
		}
		return await run(plan.command);
	} finally {
		await restore();
	}
}

if (import.meta.main) {
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(error: unknown) => {
			console.error(error instanceof Error ? error.message : error);
			process.exit(2);
		},
	);
}
