/**
 * The e-mail flows of one user type: `flows.ts` assembles them from verifying
 * an e-mail (`verify-email.ts`) and resetting a password
 * (`reset-password.ts`), which issue and redeem the same token
 * (`email-token.ts`).
 *
 * Gathered here from the files beside this one.
 */

export { emailFlows } from './flows';
