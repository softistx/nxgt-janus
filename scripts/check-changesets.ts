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
import { parseChangesetFile } from '@changesets/parse';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

export interface Changeset {
	readonly file: string;
	readonly text: string;
}

export interface Workspace {
	readonly name: string;
	readonly private: boolean;
}

/**
 * The package names a changeset bumps, read by the parser `changeset version`
 * itself uses — a hand-written one would fail open on a shape it accepts.
 * `null` when it cannot read the changeset at all.
 */
export function namesIn(text: string): string[] | null {
	try {
		return parseChangesetFile(text).releases.map((release) => release.name);
	} catch {
		return null;
	}
}

/** One line per mistake: a changeset unreadable, or naming a private or unknown package. */
export function refusals(
	changesets: readonly Changeset[],
	workspaces: readonly Workspace[],
): string[] {
	const byName = new Map(workspaces.map((one) => [one.name, one]));
	return changesets.flatMap(({ file, text }) => {
		const names = namesIn(text);
		if (names === null) {
			return [`${file}: changesets cannot read its front matter`];
		}
		return names.flatMap((name) => {
			const workspace = byName.get(name);
			if (workspace === undefined) {
				return [`${file}: ${name} is not a package of this repository`];
			}
			return workspace.private
				? [
						`${file}: ${name} is private — publish it in a commit of its own that removes "private", with this changeset`,
					]
				: [];
		});
	});
}

/** The changesets and the packages of a repository, as the check reads them. */
export async function read(
	root: string,
): Promise<{ changesets: Changeset[]; workspaces: Workspace[] }> {
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
