#!/usr/bin/env bun
/**
 * Runs a command on a package's sources in a scratch project that installs
 * several peers at their floors together, one copy of some of them.
 *
 *     bun scripts/run-in-floor-project.ts janus-graphql \
 *       graphql@16.9.0 @envelop/core@5.0.0 @graphql-tools/utils@10.0.0 \
 *       --single graphql -- bash -c 'bun test src && bun run typecheck'
 *
 * `run-on-peer-floor.ts` points links in the workspace at one floor, which
 * holds while the rest of the workspace does not depend on that peer. A
 * floor like `graphql`'s does not: graphql-yoga and the `@graphql-tools/*`
 * packages resolve graphql 17 from Bun's store, so pointing one package's
 * link at 16.9.0 gives the specs two graphql copies, and a schema from one
 * fails `instanceof` in the other. So this installs a project of its own.
 *
 * The package and its `workspace:` siblings are packed as `npm publish`
 * would pack them (`artifacts/install.ts`), and installed with the floors,
 * everything else the package lists at the version the workspace resolves
 * (`floor-project/manifest.ts`, `floor-project/layout.ts`). A floor named
 * `--single` is overridden for every package that depends on it, and the
 * install is refused unless it holds exactly one copy of it, at the floor
 * — and unless the copied sources and the packed package both resolve each
 * floor (`floor-project/copies.ts`). The packed package is then imported,
 * and the command runs from the copied package's directory. The project
 * lives in a temporary directory, removed afterwards whatever the command
 * does, on SIGINT or SIGTERM as well; nothing in the workspace is written.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { $ } from 'bun';
import { pack } from './artifacts/install';
import { readPackages } from './artifacts/packages';
import { installProblems } from './floor-project/copies';
import { layOut, lockedVersions } from './floor-project/layout';
import {
	carriedOf,
	floorProblems,
	type PackageManifest,
	projectManifest,
	siblingsOf,
} from './floor-project/manifest';
import { type ProjectPlan, parseProjectPlan } from './floor-project/plan';
import { forwardSignals } from './peer-floor/forward';

const ROOT = resolve(import.meta.dir, '..');

export interface Options {
	/** Packs the named packages into `dir`; answers each name → `file:<tarball>`. */
	readonly pack: (
		dir: string,
		names: readonly string[],
	) => Promise<Record<string, string>>;
	/** Installs the project in `dir`; throws if the install fails. */
	readonly install: (dir: string) => Promise<void>;
	/** Where the temporary directory is made; `os.tmpdir()` by default. */
	readonly tmp?: string;
}

/** Imports `name` from `project` in a Bun of its own; throws if it fails. */
async function loads(project: string, name: string): Promise<void> {
	const run = Bun.spawnSync(
		['bun', '-e', `await import(${JSON.stringify(name)})`],
		{ cwd: project, stdout: 'ignore', stderr: 'pipe' },
	);
	if (run.exitCode !== 0) {
		throw new Error(
			`${name} does not load on the floors:\n${run.stderr.toString().trim()}`,
		);
	}
}

/** Lays out, packs and installs the project; answers the copy's directory. */
async function prepare(
	root: string,
	plan: ProjectPlan,
	options: Options,
	dir: string,
	manifest: PackageManifest,
): Promise<string> {
	const pkgDir = join(root, 'packages', plan.package);
	const project = join(dir, 'project');
	const copy = await layOut(root, pkgDir, project);
	const carried = await lockedVersions(
		pkgDir,
		carriedOf(manifest, plan.floors),
	);
	const tarballs = join(dir, 'tarballs');
	await mkdir(tarballs);
	const packed = await options.pack(tarballs, [
		manifest.name,
		...siblingsOf(manifest),
	]);
	const json = projectManifest({ plan, tarballs: packed, carried });
	await Bun.write(
		join(project, 'package.json'),
		`${JSON.stringify(json, null, 2)}\n`,
	);
	await options.install(project);

	const installed = join(project, 'node_modules', manifest.name);
	const problems = await installProblems(
		project,
		[copy, installed],
		plan.floors,
		plan.single,
	);
	if (problems.length > 0) {
		throw new Error(`the install is not on the floors: ${problems.join('; ')}`);
	}
	await loads(project, manifest.name);
	for (const { name, version } of plan.floors) {
		const one = plan.single.includes(name) ? ', one copy' : '';
		console.log(`${relative(dir, copy)} → ${name}@${version}${one}`);
	}
	return copy;
}

/** Runs `plan.command` in the project on the floors; resolves its exit code. */
export async function runInFloorProject(
	root: string,
	plan: ProjectPlan,
	options: Options,
): Promise<number> {
	const manifest = (await Bun.file(
		join(root, 'packages', plan.package, 'package.json'),
	).json()) as PackageManifest;
	const refused = floorProblems(manifest, plan.floors);
	if (refused.length > 0) throw new Error(refused.join('; '));
	const dir = await mkdtemp(join(options.tmp ?? tmpdir(), 'floor-project-'));
	const signals = forwardSignals();
	try {
		const copy = await prepare(root, plan, options, dir, manifest);
		return await signals.run(plan.command, copy);
	} finally {
		await rm(dir, { recursive: true, force: true });
		signals.dispose();
	}
}

/** The workspace's packages, packed by `artifacts/install.ts`. */
async function packWorkspace(
	dir: string,
	names: readonly string[],
): Promise<Record<string, string>> {
	const packages = (await readPackages()).filter((p) => names.includes(p.name));
	return (await pack(dir, packages)).overrides;
}

/**
 * Hoisted, whatever Bun's default: `copiesOf` reads a hoisted tree, and a
 * consumer's project outside a workspace is one.
 */
async function installHoisted(dir: string): Promise<void> {
	const run = await $`bun install --linker hoisted`.cwd(dir).quiet().nothrow();
	if (run.exitCode !== 0) {
		throw new Error(`bun install failed:\n${run.stderr.toString().trim()}`);
	}
}

if (import.meta.main) {
	Promise.resolve()
		.then(() =>
			runInFloorProject(ROOT, parseProjectPlan(process.argv.slice(2)), {
				pack: packWorkspace,
				install: installHoisted,
			}),
		)
		.then(
			(code) => process.exit(code),
			(error: unknown) => {
				console.error(error instanceof Error ? error.message : error);
				process.exit(2);
			},
		);
}
