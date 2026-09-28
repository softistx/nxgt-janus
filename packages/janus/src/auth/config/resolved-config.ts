/**
 * A configuration once resolved: every default applied, every duration in
 * milliseconds — what the core reads, and never the configuration itself.
 */

import type { Sealer } from '../sealing';
import type { UserSchema } from './user-type';

/** One user type, with every default applied and every duration in milliseconds. */
export interface ResolvedType {
	readonly name: string;
	readonly schema: UserSchema;
	readonly schemaVersion: string;
	readonly password: {
		readonly login: string;
		readonly normalize: (value: string) => string;
		readonly minLength: number;
	} | null;
	readonly email: string;
	readonly lifespanMs: number;
	readonly renewAfterMs: number | null;
}

export interface ResolvedConfig {
	readonly single: boolean;
	readonly types: ReadonlyMap<string, ResolvedType>;
	readonly tokenTtlMs: {
		readonly verifyEmail: number;
		readonly resetPassword: number;
		readonly signInCode: number;
		readonly stepUp: number;
	};
	/** `null` when `signIn.throttle` is `false`. */
	readonly signInThrottle: {
		readonly attempts: number;
		readonly windowMs: number;
	} | null;
	readonly secondFactor: {
		readonly issuer: string;
		readonly sealer: Sealer;
		readonly challengeTtlMs: number;
	} | null;
	readonly cookie: {
		readonly name: string;
		readonly domain: string | null;
		readonly path: string;
		readonly sameSite: 'lax' | 'strict' | 'none';
		readonly secure: boolean;
	};
}
