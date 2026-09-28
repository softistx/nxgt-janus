import { afterEach, beforeEach, expect } from 'bun:test';
import {
	mkdir,
	mkdtemp,
	readdir,
	readlink,
	rm,
	symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import type { Plan } from './peer-floor/plan';

/**
 * A scratch tree laid out as Bun's isolated install lays it out: `name`
 * 2.0.0 in the store beside its peer `dep` 1.0.0, linked from
 * `packages/a` and `packages/b`. The floor is `name` 1.0.0.
 */
export interface Install {
	readonly root: string;
	/** Where `runOnFloor` makes its temporary directory. */
	readonly tmp: string;
	readonly scratch: string;
	/** Each package's link to `name`. */
	readonly links: () => string[];
	/** The floor's tarball, peering `dep` by `peerRange`. */
	readonly tarball: (peerRange: string) => Promise<Uint8Array>;
	readonly plan: (command: string) => Plan;
	/** The links as the install made them, and no temporary directory left. */
	readonly expectUntouched: () => Promise<void>;
}

export async function write(path: string, json: object): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, JSON.stringify(json));
}

/**
 * Registers the tree's `beforeEach`/`afterEach` in the calling spec file, a
 * fresh tree per case, and returns it — read it inside a case, not before.
 */
export function isolatedInstallPerCase(name: string): Install {
	let scratch = '';
	const root = () => join(scratch, 'root');
	const tmp = () => join(scratch, 'tmp');
	// Bun's store names `@x/lib@2.0.0` `@x+lib@2.0.0`.
	const locked = () =>
		join(
			root(),
			'node_modules/.bun',
			`${name.replace('/', '+')}@2.0.0`,
			'node_modules',
		);
	const links = () =>
		['a', 'b'].map((pkg) =>
			join(root(), 'packages', pkg, 'node_modules', name),
		);
	const original = () => {
		const [a] = links();
		return relative(dirname(a as string), join(locked(), name));
	};

	beforeEach(async () => {
		scratch = await mkdtemp(join(tmpdir(), 'peer-floor-spec-'));
		await mkdir(tmp());
		await write(join(locked(), name, 'package.json'), {
			name,
			version: '2.0.0',
		});
		const dep = join(root(), 'node_modules/.bun/dep@1.0.0/node_modules/dep');
		await write(join(dep, 'package.json'), { name: 'dep', version: '1.0.0' });
		await symlink(relative(locked(), dep), join(locked(), 'dep'));
		for (const link of links()) {
			await mkdir(dirname(link), { recursive: true });
			await symlink(original(), link);
		}
	});

	afterEach(async () => {
		await rm(scratch, { recursive: true, force: true });
	});

	return {
		get root() {
			return root();
		},
		get tmp() {
			return tmp();
		},
		get scratch() {
			return scratch;
		},
		links,
		async tarball(peerRange) {
			const src = join(scratch, `src-${peerRange}`);
			await write(join(src, 'package/package.json'), {
				name,
				version: '1.0.0',
				peerDependencies: { dep: peerRange },
			});
			const file = join(scratch, `lib-${peerRange}.tgz`);
			await Bun.spawn(['tar', '-czf', file, '-C', src, 'package']).exited;
			return new Uint8Array(await Bun.file(file).arrayBuffer());
		},
		plan: (command) => ({
			name,
			version: '1.0.0',
			packages: ['a', 'b'],
			command: ['sh', '-c', command],
		}),
		async expectUntouched() {
			for (const link of links()) {
				expect(await readlink(link)).toBe(original());
			}
			expect(await readdir(tmp())).toEqual([]);
		},
	};
}
