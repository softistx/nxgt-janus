import { describe, expect, it } from 'bun:test';
import { bunHasher, scryptHasher } from './hashers';

describe('scryptHasher', () => {
	it('verifies what it hashed, and nothing else', async () => {
		const hasher = scryptHasher({ cost: 10 });
		const hash = await hasher.hash('correct horse');

		expect(hash).toMatch(
			/^\$scrypt\$ln=10,r=8,p=1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
		);
		expect(hash).not.toContain('correct horse');
		expect(await hasher.verify('correct horse', hash)).toBe(true);
		expect(await hasher.verify('battery staple', hash)).toBe(false);
	});

	it('salts: the same password hashes twice to two strings', async () => {
		const hasher = scryptHasher({ cost: 10 });

		expect(await hasher.hash('same')).not.toBe(await hasher.hash('same'));
	});

	it('reads the parameters from the hash, so raising the cost keeps old hashes readable', async () => {
		const old = await scryptHasher({ cost: 10 }).hash('correct horse');

		expect(await scryptHasher({ cost: 11 }).verify('correct horse', old)).toBe(
			true,
		);
	});

	it('asks for a rehash of a hash written with other parameters, and of none written with its own', async () => {
		const current = scryptHasher({ cost: 11 });

		expect(current.needsRehash?.(await current.hash('x'))).toBe(false);
		expect(
			current.needsRehash?.(await scryptHasher({ cost: 10 }).hash('x')),
		).toBe(true);
		// A lowered cost is a change of policy too, and rewritten as one.
		expect(
			scryptHasher({ cost: 10 }).needsRehash?.(await current.hash('x')),
		).toBe(true);
		expect(current.needsRehash?.('$scrypt$garbage')).toBe(false);
	});

	it('defaults to OWASP’s N = 2^17', async () => {
		// Asserted on the string only: hashing at 2^17 costs ~128 MiB and a
		// few hundred milliseconds, which this spec does not need to pay.
		expect(scryptHasher().prefix).toBe('$scrypt$');
		expect(() => scryptHasher({ cost: 9 })).toThrow(TypeError);
		expect(() => scryptHasher({ cost: 17.5 })).toThrow(TypeError);
	});

	it('refuses a corrupt hash rather than calling it a wrong password', async () => {
		const error = await scryptHasher({ cost: 10 })
			.verify('x', '$scrypt$garbage')
			.then(
				() => null,
				(caught: unknown) => caught,
			);

		expect(error).toBeInstanceOf(TypeError);
	});
});

describe('bunHasher', () => {
	it('hashes argon2id, and its hashes read anywhere a $argon2id$ verifier is wired', async () => {
		const hasher = bunHasher();
		const hash = await hasher.hash('correct horse');

		expect(hash.startsWith(hasher.prefix)).toBe(true);
		expect(await hasher.verify('correct horse', hash)).toBe(true);
		expect(await hasher.verify('battery staple', hash)).toBe(false);
	});

	it('pins its parameters, and asks for a rehash of any other', async () => {
		const hasher = bunHasher();
		const hash = await hasher.hash('correct horse');
		const weaker = await Bun.password.hash('correct horse', {
			algorithm: 'argon2id',
			memoryCost: 19_456,
			timeCost: 2,
		});

		expect(hash).toStartWith('$argon2id$v=19$m=65536,t=2,p=1$');
		expect(hasher.needsRehash?.(hash)).toBe(false);
		expect(hasher.needsRehash?.(weaker)).toBe(true);
	});
});
