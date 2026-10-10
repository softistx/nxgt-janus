/**
 * What a call to the port must say: the version an update expects, and the
 * kind of token it redeems, counts or spends. Cases 6, 7, 17 and 22 of the
 * twenty-five — see `fixtures.ts`.
 */

import { now, record, tokens, users } from './fixtures';

// ── 6. An update with no expected version ──────────────────────────────────
// `ifVersion` is required on the port: an optional check is the one somebody
// forgets on the one write where it mattered.
// @ts-expect-error ifVersion is required
users.updateUser(record.id, { updatedAt: now });

// ── 7. A redemption that does not say what the token is for ────────────────
// Without `kind`, a verification token redeems as a reset token.
// @ts-expect-error kind is required
tokens.consumeToken('hash', now);

// ── 17. An attempt counted without saying what the token is for ────────────
// Without `kind`, a guess at a sign-in code counts against a reset link.
// @ts-expect-error kind is required
tokens.countAttempt('hash');

// ── 22. Spending a user's tokens without saying which kind ─────────────────
// Without `kind`, issuing a sign-in code would spend the user's reset link and
// their e-mail verification with it.
// @ts-expect-error kind is required
tokens.spendUserTokens(record.id, now);
