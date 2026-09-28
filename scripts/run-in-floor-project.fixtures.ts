import { afterEach, beforeEach, expect } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ProjectPlan } from './floor-project/plan';
import type { Options } from './run-in-floor-project';

/**
 * A scratch workspace: `packages/p`, `@x/p`, peering `lib` from `^1` and
 * listing the sibling `@x/sib` by `workspace:` and `dep` for its specs,
 * which the root's `node_modules` holds at 1.2.3. The floor is `lib` 1.0.0.
 */
export interface Workspace {
	readonly root: string;
	/** Where `runInFloorProject` makes its temporary directory. */
	readonly tmp: string;
	readonly plan: (command: string, single?: readonly string[]) => ProjectPlan;
	/**
	 * Options whose install writes the given `node_modules` — each path to a
	 * version — plus a loadable `@x/p`, and records what it was handed.
	 */
	readonly options: (
		modules: Readonly<Record<string, string>>,
		loads?: string,
	) => Options & { readonly seen: () => Record<string, unknown> };
	/** No temporary directory left behind. */
	readonly expectCleaned: () => Promise<void>;
}

async function write(path: string, content: string | object) {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(
		path,
		typeof content === 'string' ? content : JSON.stringify(content),
	);
}

/** Registers a fresh workspace per case in the calling spec file. */
export function workspacePerCase(): Workspace {
	let scratch = '';
	const root = () => join(scratch, 'root');
	const tmp = () => join(scratch, 'tmp');
	beforeEach(async () => {
		scratch = await mkdtemp(join(tmpdir(), 'floor-project-spec-'));
		const pkg = join(root(), 'packages/p');
		await write(join(pkg, 'package.json'), {
			name: '@x/p',
			devDependencies: { '@x/sib': 'workspace:^', dep: '^1', lib: '^2' },
			peerDependencies: { lib: '^1 || ^2' },
		});
		await write(join(pkg, 'src/index.ts'), 'export {};\n');
		await write(join(pkg, 'node_modules/lib/package.json'), {
			version: '2.0.0',
		});
		await write(join(pkg, 'dist/index.js'), '');
		await write(join(root(), 'node_modules/dep/package.json'), {
			version: '1.2.3',
		});
		await write(join(root(), 'node_modules/lib/package.json'), {
			version: '2.0.0',
		});
		await write(join(root(), 'tsconfig.base.json'), '{}');
		await mkdir(tmp(), { recursive: true });
	});
	afterEach(() => rm(scratch, { recursive: true, force: true }));

	return {
		get root() {
			return root();
		},
		get tmp() {
			return tmp();
		},
		plan: (command, single = []) => ({
			package: 'p',
			floors: [{ name: 'lib', version: '1.0.0' }],
			single,
			command: ['bash', '-c', command],
		}),
		options(modules, loads = 'export const ok = true;\n') {
			const seen: Record<string, unknown> = {};
			return {
				tmp: tmp(),
				seen: () => seen,
				pack: async (dir, names) => {
					seen.packed = names;
					return Object.fromEntries(
						names.map((name) => [name, `file:${dir}/${name}.tgz`]),
					);
				},
				install: async (dir) => {
					seen.manifest = await Bun.file(join(dir, 'package.json')).json();
					const p = join(dir, 'node_modules/@x/p');
					await write(join(p, 'package.json'), {
						name: '@x/p',
						type: 'module',
						exports: './index.js',
					});
					await write(join(p, 'index.js'), loads);
					for (const [path, version] of Object.entries(modules)) {
						await write(join(dir, path, 'package.json'), { version });
					}
				},
			};
		},
		async expectCleaned() {
			expect(await readdir(tmp())).toEqual([]);
		},
	};
}
