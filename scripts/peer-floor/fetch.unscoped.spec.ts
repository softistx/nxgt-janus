import { afterEach, describe, expect, test } from 'bun:test';
import { download } from './fetch';

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** Answers the registry document and the tarball; records what was asked. */
function registry(tarball: string, bytes: Uint8Array): string[] {
	const hasher = new Bun.CryptoHasher('sha512');
	hasher.update(bytes);
	const integrity = `sha512-${hasher.digest('base64')}`;
	const asked: string[] = [];
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = String(input);
		asked.push(url);
		return url === tarball
			? new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]))
			: Response.json({ dist: { tarball, integrity } });
	}) as typeof fetch;
	return asked;
}

describe('download', () => {
	test("reads an unscoped name's document, then the tarball it names", async () => {
		const bytes = new TextEncoder().encode('graphql');
		const tarball = 'https://registry.npmjs.org/graphql/-/graphql-16.9.0.tgz';
		const asked = registry(tarball, bytes);
		expect(await download('graphql', '16.9.0')).toEqual(bytes);
		expect(asked).toEqual([
			'https://registry.npmjs.org/graphql/16.9.0',
			tarball,
		]);
	});

	test('refuses an unscoped tarball that does not match its integrity', async () => {
		const tarball = 'https://registry.npmjs.org/graphql/-/graphql-16.9.0.tgz';
		registry(tarball, new TextEncoder().encode('graphql'));
		const served = globalThis.fetch;
		globalThis.fetch = (async (input: string | URL | Request) =>
			String(input) === tarball
				? new Response('tampered')
				: served(input)) as typeof fetch;
		await expect(download('graphql', '16.9.0')).rejects.toThrow(
			`${tarball} does not match`,
		);
	});
});
