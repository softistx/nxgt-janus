/**
 * What the sign-in code's specs share. Specs only — no case lives here.
 */

/** A code that is not `code`: the one a visitor mistypes. */
export const other = (code: string) =>
	code === '000000' ? '111111' : '000000';
