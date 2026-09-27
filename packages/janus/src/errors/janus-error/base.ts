import type { JanusErrorCode } from './codes';
import type { CredentialRefusal, Issue, JanusErrorOptions } from './options';

/**
 * The base of everything this package throws at call time.
 *
 * It extends `Error` and not `TypeError`, and the rule behind that is
 * `nxgt-data`'s: *extend whichever class the refusals it replaces already
 * threw, so no consumer's `catch` stops working*. These replace nothing — the
 * package is new — and `DataError`, `RedisError` and `S3Error` all extend
 * `Error`, so nobody has to order their `catch` blocks.
 *
 * **There is exactly one definition of this class**, and that matters more here
 * than it looks: an adapter in another package throws `StoreFailure` and this
 * package tests it with `instanceof`. Two copies and the product is wrong about
 * what an outage is. `build.ts` shares the module across entry points with
 * `splitting: true`, and `scripts/verify-artifacts.ts` fails the build if any
 * class name appears in two entry bundles of the packed tarball.
 */
export class JanusError extends Error {
	override name = 'JanusError';
	readonly code: JanusErrorCode = 'STORE_FAILED';
	readonly userId: string | undefined;
	readonly userType: string | undefined;
	readonly login: string | undefined;
	readonly reason: CredentialRefusal | undefined;
	readonly hashPrefix: string | undefined;
	readonly expectedVersion: number | undefined;
	readonly actualVersion: number | undefined;
	readonly issues: readonly Issue[] | undefined;
	readonly minLength: number | undefined;
	readonly operation: string | undefined;
	readonly slot: 'users' | 'sessions' | 'tokens' | 'relations' | undefined;
	readonly permission: string | undefined;
	readonly maxDepth: number | undefined;
	readonly attemptsLeft: number | undefined;

	constructor(message: string, options?: JanusErrorOptions) {
		super(message, { cause: options?.cause });
		this.userId = options?.userId;
		this.userType = options?.userType;
		this.login = options?.login;
		this.reason = options?.reason;
		this.hashPrefix = options?.hashPrefix;
		this.expectedVersion = options?.expectedVersion;
		this.actualVersion = options?.actualVersion;
		this.issues = options?.issues;
		this.minLength = options?.minLength;
		this.operation = options?.operation;
		this.slot = options?.slot;
		this.permission = options?.permission;
		this.maxDepth = options?.maxDepth;
		this.attemptsLeft = options?.attemptsLeft;
	}
}
