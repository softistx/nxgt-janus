export const USAGE =
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
