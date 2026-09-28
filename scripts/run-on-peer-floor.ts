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
 * tarball is fetched from npm and checked against the registry's integrity
 * (`peer-floor/fetch.ts`), then unpacked into a temporary directory beside
 * links to the peers the locked copy resolves, which must satisfy the
 * floor's own ranges (`peer-floor/stage.ts`). Each named package's
 * `node_modules/<name>` link, which Bun's isolated install made, is pointed
 * at it, and must then resolve the floor's version. Whatever the command
 * does, the links are put back and the directory removed afterwards — on
 * SIGINT or SIGTERM as well, forwarded to the command first — so a later
 * step, or the developer's tree, is left as the install made it.
 *
 * A link that does not point into `node_modules/.bun` — one left by a run
 * killed outright — is refused rather than taken for the original.
 */

import {
	lstat,
	mkdtemp,
	readlink,
	realpath,
	rm,
	symlink,
	unlink,
} from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import type { Subprocess } from 'bun';
import { download } from './peer-floor/fetch';
import { type Plan, parsePlan } from './peer-floor/plan';
import { stage } from './peer-floor/stage';

const ROOT = resolve(import.meta.dir, '..');

export interface Options {
	readonly download: (name: string, version: string) => Promise<Uint8Array>;
	/** Where the temporary directory is made; `os.tmpdir()` by default. */
	readonly tmp?: string;
}

interface Swap {
	readonly link: string;
	readonly original: string;
}

/** Each named package's link to the peer, checked to be the install's own. */
async function locate(root: string, plan: Plan): Promise<Swap[]> {
	const store = (await realpath(join(root, 'node_modules', '.bun'))) + sep;
	const swaps: Swap[] = [];
	let locked: string | undefined;
	for (const pkg of plan.packages) {
		const link = join(root, 'packages', pkg, 'node_modules', plan.name);
		const shown = relative(root, link);
		const stat = await lstat(link).catch(() => undefined);
		if (!stat?.isSymbolicLink()) {
			throw new Error(`${shown} is not a link; run bun install`);
		}
		const real = await realpath(link).catch(() => '');
		if (!real.startsWith(store)) {
			throw new Error(
				`${shown} does not point into node_modules/.bun — left by an interrupted run? Run bun install`,
			);
		}
		if (locked !== undefined && real !== locked) {
			throw new Error(`${shown} resolves another copy than the first package`);
		}
		locked = real;
		swaps.push({ link, original: await readlink(link) });
	}
	return swaps;
}

/** Runs `plan.command` from `root` on the floor; resolves its exit code. */
export async function runOnFloor(
	root: string,
	plan: Plan,
	options: Options,
): Promise<number> {
	const swaps = await locate(root, plan);
	const [first] = swaps;
	if (!first) throw new Error('no package named');
	// `.../node_modules/@nxgt/mongo` → `.../node_modules`.
	const lockedModules = join(
		await realpath(first.link),
		...plan.name.split('/').map(() => '..'),
	);
	const dir = await mkdtemp(join(options.tmp ?? tmpdir(), 'peer-floor-'));
	let child: Subprocess | undefined;
	let interrupted: NodeJS.Signals | undefined;
	// Named per signal, not read from the listener's argument, which a
	// `process.emit` does not pass.
	const forward = (signal: NodeJS.Signals) => () => {
		interrupted = signal;
		child?.kill(signal);
	};
	const onInt = forward('SIGINT');
	const onTerm = forward('SIGTERM');
	process.on('SIGINT', onInt);
	process.on('SIGTERM', onTerm);
	let restoring: Promise<void> | undefined;
	const restore = () => {
		restoring ??= (async () => {
			for (const { link, original } of swaps) {
				await rm(link, { force: true });
				await symlink(original, link);
			}
			await rm(dir, { recursive: true, force: true });
		})();
		return restoring;
	};

	try {
		const tarball = await options.download(plan.name, plan.version);
		const floor = await stage(plan.name, tarball, lockedModules, dir);
		for (const { link } of swaps) {
			await unlink(link);
			await symlink(floor, link);
			const { version } = (await Bun.file(
				join(link, 'package.json'),
			).json()) as {
				version?: string;
			};
			if (version !== plan.version) {
				throw new Error(`${link} resolves ${version}, not ${plan.version}`);
			}
			console.log(`${relative(root, link)} → ${plan.name}@${version}`);
		}
		if (interrupted) return 128 + constants.signals[interrupted];
		child = Bun.spawn([...plan.command], {
			cwd: root,
			stdio: ['inherit', 'inherit', 'inherit'],
		});
		const code = await child.exited;
		return interrupted ? 128 + constants.signals[interrupted] : code;
	} finally {
		await restore();
		process.off('SIGINT', onInt);
		process.off('SIGTERM', onTerm);
	}
}

if (import.meta.main) {
	Promise.resolve()
		.then(() =>
			runOnFloor(ROOT, parsePlan(process.argv.slice(2)), { download }),
		)
		.then(
			(code) => process.exit(code),
			(error: unknown) => {
				console.error(error instanceof Error ? error.message : error);
				process.exit(2);
			},
		);
}
