/**
 * `@permission`'s `id:` — `args.<path>` or `parent.<path>` — parsed when the
 * schema is built, and read from a request's arguments or parent value when a
 * field is resolved.
 */

/** A parsed `id:`. */
export interface IdPath {
	/** As written: `args.id`, `parent.wardId`, `args.input.ids`. */
	readonly text: string;
	readonly root: 'args' | 'parent';
	/** The names after the root, at least one. */
	readonly segments: readonly string[];
}

const NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

/** `text` parsed, or `null` when it is not `args.<name>…` or `parent.<name>…`. */
export function parsePath(text: string): IdPath | null {
	const [root, ...segments] = text.split('.');
	if (root !== 'args' && root !== 'parent') return null;
	if (segments.length === 0 || !segments.every((name) => NAME.test(name))) {
		return null;
	}
	return { text, root, segments };
}

/** One object a check is about: its id, and the value that holds it when that value is the object. */
export interface Target {
	readonly id: string;
	/** The value the id was read from, when `id` is its `id` field under `parent`. */
	readonly holder: object | null;
}

/**
 * The objects `path` names in this request: one, or one per element where a
 * step reads a list. `null` when a step reads nothing, or an id is not a
 * string or an integer: the request resolved no object id.
 */
export function targetsOf(
	path: IdPath,
	parent: unknown,
	args: unknown,
): readonly Target[] | null {
	const containers = walk(
		[path.root === 'args' ? args : parent],
		path.segments.slice(0, -1),
	);
	if (containers === null) return null;
	const last = path.segments[path.segments.length - 1] as string;
	const held = path.root === 'parent' && last === 'id';
	const targets: Target[] = [];
	for (const container of containers) {
		for (const value of spread((container as Record<string, unknown>)[last])) {
			const id = idOf(value);
			if (id === null) return null;
			targets.push({ id, holder: held ? (container as object) : null });
		}
	}
	return targets;
}

/** The values `segments` reach from `values`, a list read as its elements. */
function walk(
	values: readonly unknown[],
	segments: readonly string[],
): readonly unknown[] | null {
	let current = values;
	for (const segment of segments) {
		const next: unknown[] = [];
		for (const value of current) {
			if (typeof value !== 'object' || value === null) return null;
			next.push(...spread((value as Record<string, unknown>)[segment]));
		}
		current = next;
	}
	return current.every((value) => typeof value === 'object' && value !== null)
		? current
		: null;
}

function spread(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value.flat(Number.POSITIVE_INFINITY) : [value];
}

/** An `ID` as graphql-js coerces one: a string, or an integer serialised. */
function idOf(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' && Number.isSafeInteger(value)) {
		return String(value);
	}
	return null;
}
