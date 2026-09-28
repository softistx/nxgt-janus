const REGISTRY = 'https://registry.npmjs.org';
/** A registry that does not answer fails the step, not the job's timeout. */
const TIMEOUT_MS = 60_000;

/** Whether `bytes` match an npm `sha512-<base64>` integrity. Pure. */
export function matchesIntegrity(
	integrity: string,
	bytes: Uint8Array,
): boolean {
	const [algorithm, expected] = integrity.split('-', 2);
	if (algorithm !== 'sha512' || !expected) return false;
	const hasher = new Bun.CryptoHasher('sha512');
	hasher.update(bytes);
	return hasher.digest('base64') === expected;
}

/** The published tarball of `name@version`, checked against its integrity. */
export async function download(
	name: string,
	version: string,
): Promise<Uint8Array> {
	const signal = AbortSignal.timeout(TIMEOUT_MS);
	const meta = await fetch(`${REGISTRY}/${name}/${version}`, { signal });
	if (!meta.ok) throw new Error(`${name}@${version}: registry ${meta.status}`);
	const { dist } = (await meta.json()) as {
		dist: { tarball: string; integrity: string };
	};
	const tarball = await fetch(dist.tarball, { signal });
	if (!tarball.ok) {
		throw new Error(`${dist.tarball}: registry ${tarball.status}`);
	}
	const bytes = new Uint8Array(await tarball.arrayBuffer());
	if (!matchesIntegrity(dist.integrity, bytes)) {
		throw new Error(`${dist.tarball} does not match ${dist.integrity}`);
	}
	return bytes;
}
