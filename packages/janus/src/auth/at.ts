/**
 * The prefix a refusal names where it happened: `at('signIn')` answers
 * `signIn` under the single-type form (`user`), and `patient.signIn` under
 * `users`, however many types it declares. `typeApi` builds one per user type
 * and hands it to every flow, so an error names the operation exactly as the
 * consumer called it.
 */
export type At = (operation: string) => string;
