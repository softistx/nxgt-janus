import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from './config';

/**
 * scrypt through `node:crypto` — the hasher that runs **everywhere**: Node and
 * Bun both implement it, and it needs no dependency.
 *
 * Measured before choosing it: `bun build --target node` leaves `Bun.password`
 * in the output as it is — a target changes the bundle's format, not which
 * APIs exist — and `crypto.argon2` is absent from Node 22. scrypt is the one
 * memory-hard function both runtimes ship.
 *
 * The defaults are OWASP's: N = 2^17, r = 8, p = 1, about 128 MiB per hash.
 * The parameters are written into the hash —
 * `$scrypt$ln=17,r=8,p=1$<salt>$<key>` — and read back from it to verify, so
 * raising `cost` later leaves every existing hash readable.
 *
 * `cost` is log2(N). Lower it only in tests: 10 is fast and still exercises
 * every line.
 *
 * A hash written with other parameters than these is rewritten with these the
 * next time its owner signs in (`needsRehash`), so raising `cost` reaches every
 * active user without a migration.
 */
export function scryptHasher(options?: {
	readonly cost?: number;
}): PasswordHasher {
	const cost = options?.cost ?? 17;
	if (!Number.isInteger(cost) || cost < 10 || cost > 20) {
		throw new TypeError(
			'scryptHasher: cost is log2(N), an integer from 10 to 20 — 17 is the recommended value',
		);
	}

	return {
		prefix: SCRYPT_PREFIX,
		async hash(plain) {
			const salt = randomBytes(16);
			const key = await derive(plain, salt, cost, 8, 1);
			return `${SCRYPT_PREFIX}ln=${cost},r=8,p=1$${salt.toString('base64')}$${key.toString('base64')}`;
		},
		async verify(plain, hash) {
			const parsed = SCRYPT_HASH.exec(hash);
			// A hash this hasher cannot parse is not a wrong password, and not
			// something to guess at: the core picked this verifier by prefix, so
			// the stored hash is corrupt.
			if (parsed === null) {
				throw new TypeError(
					'scryptHasher: the stored hash has the $scrypt$ prefix and not its format',
				);
			}
			const [, ln, r, p, salt, key] = parsed as unknown as [
				string,
				string,
				string,
				string,
				string,
				string,
			];
			const expected = Buffer.from(key, 'base64');
			const actual = await derive(
				plain,
				Buffer.from(salt, 'base64'),
				Number(ln),
				Number(r),
				Number(p),
				expected.length,
			);
			return timingSafeEqual(actual, expected);
		},
		needsRehash(hash) {
			const parsed = SCRYPT_HASH.exec(hash);
			// Unparseable is verify's refusal to make, not a reason to rewrite.
			if (parsed === null) return false;
			const [, ln, r, p] = parsed;
			return Number(ln) !== cost || r !== '8' || p !== '1';
		},
	};
}

const SCRYPT_PREFIX = '$scrypt$';
const SCRYPT_HASH =
	/^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

function derive(
	plain: string,
	salt: Buffer,
	ln: number,
	r: number,
	p: number,
	length = 32,
): Promise<Buffer> {
	// Node's camelCase aliases for N, r and p: this repository has no other
	// casing, and Node accepts both spellings.
	const n = 2 ** ln;
	return new Promise((resolve, reject) => {
		// maxmem: Node's default (32 MiB) is below what N = 2^17, r = 8 needs.
		// `error` is null on Node and undefined on Bun when there is none —
		// measured: testing `=== null` rejected every hash under Bun.
		scrypt(
			plain,
			salt,
			length,
			{ cost: n, blockSize: r, parallelization: p, maxmem: 256 * n * r },
			(error, key) => (error ? reject(error) : resolve(key)),
		);
	});
}

/**
 * argon2id through `Bun.password`.
 *
 * **Loaded only when named**: nothing reads `Bun` until this function is called,
 * so the package imports cleanly under Node. On Node, `scryptHasher()` is the
 * hasher; a hash written here reads anywhere a verifier for `$argon2id$` is
 * wired, so a database can move between the two runtimes.
 */
export function bunHasher(): PasswordHasher {
	// `typeof` on an undeclared global is 'undefined' rather than a throw, so
	// this line is safe under Node.
	const password: BunPassword | undefined =
		typeof Bun === 'undefined' ? undefined : Bun.password;

	if (password === undefined) {
		throw new TypeError(
			'bunHasher: Bun.password is not available — this runtime is not Bun; wire scryptHasher() instead',
		);
	}

	return {
		prefix: '$argon2id$',
		hash: (plain) => password.hash(plain, ARGON2ID),
		verify: (plain, hash) => password.verify(plain, hash),
		needsRehash: (hash) => !hash.startsWith(ARGON2ID_PARAMETERS),
	};
}

/**
 * Pinned rather than left to `Bun.password`'s defaults — which they equal
 * today, measured: `$argon2id$v=19$m=65536,t=2,p=1$` — so that a change of
 * default in a Bun release is a rehash this package decided, not one it
 * inherited.
 */
const ARGON2ID = {
	algorithm: 'argon2id',
	memoryCost: 65_536,
	timeCost: 2,
} as const;
const ARGON2ID_PARAMETERS = '$argon2id$v=19$m=65536,t=2,p=1$';

interface BunPassword {
	hash(plain: string, options: typeof ARGON2ID): Promise<string>;
	verify(plain: string, hash: string): Promise<boolean>;
}
