import type { JanusTables } from '../tables';

/** The four tables the identity stores query. */
export type IdentityTable = 'users' | 'logins' | 'sessions' | 'tokens';
export type IdentityTables = Pick<JanusTables, IdentityTable>;
