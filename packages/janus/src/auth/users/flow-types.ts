/**
 * The types every flow in `users/` shares: what a flow receives and how a
 * sign-in finishes.
 */

import type { AnyUser } from '../context';
import type { DeviceHint } from '../devices';
import type { UserRecord } from '../port/types';
import type { SignInResult } from '../types';

/** A user's fields as a flow receives them, before any schema read them. */
export type Input = Record<string, unknown>;

/** What a sign-in answers once the user proved who they are: `secondFactorFlows`'s `finish`. */
export type Finish = (
	record: UserRecord,
	where: string,
	device: DeviceHint,
) => Promise<SignInResult<AnyUser>>;
