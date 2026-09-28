import type { Floor, ProjectPlan } from './plan';

type Ranges = Readonly<Record<string, string>>;

export interface PackageManifest {
	readonly name: string;
	readonly dependencies?: Ranges;
	readonly devDependencies?: Ranges;
	readonly peerDependencies?: Ranges;
}

/** Every name the package lists, in any of its three fields. */
function listed(manifest: PackageManifest): Ranges {
	return {
		...manifest.devDependencies,
		...manifest.dependencies,
		...manifest.peerDependencies,
	};
}

/** The siblings the package lists by `workspace:`, which are packed. Pure. */
export function siblingsOf(manifest: PackageManifest): string[] {
	return Object.entries(listed(manifest))
		.filter(([, range]) => range.startsWith('workspace:'))
		.map(([name]) => name);
}

/**
 * What the project installs at the version the workspace resolves: every
 * name the package lists that is neither a floor nor a sibling — its test
 * libraries, and a peer such as `typescript` the specs need. Pure.
 */
export function carriedOf(
	manifest: PackageManifest,
	floors: readonly Floor[],
): string[] {
	const skip = new Set([
		...floors.map((floor) => floor.name),
		...siblingsOf(manifest),
	]);
	return Object.keys(listed(manifest)).filter((name) => !skip.has(name));
}

/**
 * A floor that is not one of the package's peers, or not in its peer
 * range: a floor the package does not promise is not one to measure. Pure.
 */
export function floorProblems(
	manifest: PackageManifest,
	floors: readonly Floor[],
): string[] {
	const peers = manifest.peerDependencies ?? {};
	const problems: string[] = [];
	for (const { name, version } of floors) {
		const range = peers[name];
		if (range === undefined) {
			problems.push(`${name} is not a peer of ${manifest.name}`);
		} else if (!Bun.semver.satisfies(version, range)) {
			problems.push(
				`${name} ${version} is outside ${manifest.name}'s ${range}`,
			);
		}
	}
	return problems;
}

export interface ProjectInput {
	readonly plan: ProjectPlan;
	/** Each sibling's name to `file:<its packed tarball>`. */
	readonly tarballs: Ranges;
	/** Each carried name to the exact version the workspace resolves. */
	readonly carried: Ranges;
}

/**
 * The scratch project's `package.json`: the floors, the carried names and
 * the tarballs as its dependencies, every one exact, and `overrides` for
 * the floors held single — so a library that wants a newer one gets the
 * floor all the same — and for the tarballs, so a sibling's range resolves
 * to the tarball rather than to npm. Pure.
 */
export function projectManifest({ plan, tarballs, carried }: ProjectInput) {
	const floors = Object.fromEntries(
		plan.floors.map(({ name, version }) => [name, version]),
	);
	const single = Object.fromEntries(
		plan.single.map((name) => [name, floors[name] as string]),
	);
	return {
		name: 'nxgt-janus-floor-project',
		private: true,
		version: '0.0.0',
		type: 'module',
		dependencies: { ...carried, ...floors, ...tarballs },
		overrides: { ...single, ...tarballs },
	};
}
