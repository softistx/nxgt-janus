import { parseFloor } from '../peer-floor/plan';

export const USAGE =
	'usage: run-in-floor-project.ts <package> <name>@<version>... [--single <name>]... -- <command>...';

/** A directory under `packages/`: one segment, never `..`. */
const PACKAGE = /^[a-z0-9][a-z0-9._-]*$/;

export interface Floor {
	readonly name: string;
	readonly version: string;
}

export interface ProjectPlan {
	/** The directory under `packages/` whose sources run on the floors. */
	readonly package: string;
	readonly floors: readonly Floor[];
	/**
	 * Floors the project holds one copy of: overridden for every package that
	 * depends on them, and refused unless exactly one is installed.
	 */
	readonly single: readonly string[];
	readonly command: readonly string[];
}

/**
 * Reads `<package> <name>@<version>... [--single <name>]... -- <command>...`.
 * Pure; throws on misuse.
 */
export function parseProjectPlan(argv: readonly string[]): ProjectPlan {
	const dash = argv.indexOf('--');
	const head = dash === -1 ? argv : argv.slice(0, dash);
	const command = dash === -1 ? [] : argv.slice(dash + 1);
	const [pkg, ...rest] = head;
	if (!pkg || command.length === 0) throw new Error(USAGE);
	if (!PACKAGE.test(pkg)) {
		throw new Error(`${pkg} is not a directory under packages/. ${USAGE}`);
	}
	const floors: Floor[] = [];
	const single: string[] = [];
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i] as string;
		if (arg !== '--single') {
			floors.push(parseFloor(arg, USAGE));
			continue;
		}
		const name = rest[++i];
		if (name === undefined) throw new Error(USAGE);
		single.push(name);
	}
	if (floors.length === 0) throw new Error(USAGE);
	const named = new Set(floors.map((floor) => floor.name));
	if (named.size !== floors.length) {
		throw new Error(`a floor is named twice. ${USAGE}`);
	}
	for (const name of single) {
		if (!named.has(name)) {
			throw new Error(`--single ${name} names no floor. ${USAGE}`);
		}
	}
	return { package: pkg, floors, single, command };
}
