#!/usr/bin/env bun
/**
 * Refuses a changeset that names a private package, or one that does not
 * exist.
 *
 * `changeset version` bumps a private package like any other, and
 * `scripts/publish.ts` then skips it — so the changeset is consumed and
 * nothing ships. Worse, while it waits, the release workflow stays in
 * version mode: it keeps opening a "Version packages" PR instead of
 * publishing (#51 → #53). A package becomes publishable in a commit of its
 * own, with the changeset that versions it — never by a changeset written
 * ahead of time.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

export interface Changeset {
	readonly file: string;
	readonly text: string;
}

export interface Workspace {
	readonly name: string;
	readonly private: boolean;
}

/** The package names a changeset's front matter bumps. */
export function namesIn(text: string): string[] {
	const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
	return [...front.matchAll(/^\s*["']?([^"':\s]+)["']?\s*:/gm)].map(
		(match) => match[1] as string,
	);
}

/** One line per mistake: a changeset naming a private or unknown package. */
export function refusals(
	changesets: readonly Changeset[],
	workspaces: readonly Workspace[],
): string[] {
	const byName = new Map(workspaces.map((one) => [one.name, one]));
	return changesets.flatMap(({ file, text }) =>
		namesIn(text).flatMap((name) => {
			const workspace = byName.get(name);
			if (workspace === undefined) {
				return [`${file}: ${name} is not a package of this repository`];
			}
			return workspace.private
				? [
						`${file}: ${name} is private — publish it in a commit of its own that removes "private", with this changeset`,
					]
				: [];
		}),
	);
}

async function read(root: string) {
	const changesets: Changeset[] = [];
	for (const file of await readdir(join(root, '.changeset'))) {
		if (!file.endsWith('.md') || file === 'README.md') continue;
		changesets.push({
			file: `.changeset/${file}`,
			text: await Bun.file(join(root, '.changeset', file)).text(),
		});
	}
	const workspaces: Workspace[] = [];
	for (const dir of await readdir(join(root, 'packages'))) {
		const manifest = Bun.file(join(root, 'packages', dir, 'package.json'));
		if (!(await manifest.exists())) continue;
		const { name, private: hidden } = await manifest.json();
		workspaces.push({ name, private: hidden === true });
	}
	return { changesets, workspaces };
}

if (import.meta.main) {
	const { changesets, workspaces } = await read(ROOT);
	const found = refusals(changesets, workspaces);
	for (const line of found) console.error(line);
	process.exit(found.length === 0 ? 0 : 1);
}
