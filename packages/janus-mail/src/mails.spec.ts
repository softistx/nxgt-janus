import { describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRenderer, withMailsFolder } from './mails';

const files = { 'a.txt': 'one', 'en/b.html': '<p>two</p>' };

describe('withMailsFolder', () => {
	test('hands the files in a private folder, removed afterwards', () => {
		const base = mkdtempSync(join(tmpdir(), 'mails-spec-'));
		try {
			let seen = '';
			const result = withMailsFolder(
				(dir) => {
					seen = dir;
					expect(dir.startsWith(base)).toBe(true);
					expect(readFileSync(join(dir, 'en', 'b.html'), 'utf8')).toBe(
						'<p>two</p>',
					);
					return 7;
				},
				files,
				base,
			);
			expect(result).toBe(7);
			expect(existsSync(seen)).toBe(false);
			expect(readdirSync(base)).toEqual([]);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	test('removes the folder when the use throws, and a second call gets another', () => {
		const base = mkdtempSync(join(tmpdir(), 'mails-spec-'));
		try {
			const dirs: string[] = [];
			const use = (dir: string): never => {
				dirs.push(dir);
				throw new Error('boom');
			};
			expect(() => withMailsFolder(use, files, base)).toThrow('boom');
			expect(() => withMailsFolder(use, files, base)).toThrow('boom');
			expect(dirs[0]).not.toBe(dirs[1]);
			expect(readdirSync(base)).toEqual([]);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	test('names an unwritable base folder', () => {
		const missing = join(tmpdir(), 'mails-spec-missing', 'nowhere');
		let error: Error | undefined;
		try {
			withMailsFolder(() => 1, files, missing);
		} catch (e) {
			error = e as Error;
		}
		expect(error?.message).toContain(
			`cannot write the default e-mails under ${missing}`,
		);
		expect(error?.message).toContain('TMPDIR');
		expect(error?.cause).toBeInstanceOf(Error);
	});
});

describe('defaultRenderer', () => {
	test('leaves nothing in the temporary folder', () => {
		const before = readdirSync(tmpdir()).filter((n) =>
			n.startsWith('nxgt-janus-mail-'),
		);
		expect(defaultRenderer().emails).toContain('sign-in-code');
		const after = readdirSync(tmpdir()).filter((n) =>
			n.startsWith('nxgt-janus-mail-'),
		);
		expect(after).toEqual(before);
	});
});
