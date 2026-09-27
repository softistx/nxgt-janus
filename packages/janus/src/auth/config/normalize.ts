/**
 * How a login, and an e-mail, is normalised before any store sees it: the
 * rules `password.normalize` may name, and the one an e-mail always uses.
 */

/**
 * How a login is normalised before any store sees it. `'lowercaseTrim'` when
 * absent — right for an e-mail and for most usernames.
 *
 * A function is accepted for anything else. It must be deterministic: the same
 * rule normalises at sign-up and at sign-in.
 */
export type Normalize =
	| 'none'
	| 'lowercase'
	| 'lowercaseTrim'
	| 'nfkcLowercaseTrim'
	| ((value: string) => string);

const NORMALIZERS = {
	none: (value: string) => value,
	lowercase: (value: string) => value.toLowerCase(),
	lowercaseTrim: (value: string) => value.toLowerCase().trim(),
	nfkcLowercaseTrim: (value: string) =>
		value.normalize('NFKC').toLowerCase().trim(),
} as const satisfies Record<string, (value: string) => string>;

/** How an e-mail is compared: always the same rule, whatever the login's. */
export const normalizeEmail = NORMALIZERS.lowercaseTrim;

/** The function a {@link Normalize} rule names, or a wiring refusal. */
export function normalizer(
	rule: Normalize,
	where: string,
): (value: string) => string {
	if (typeof rule === 'function') return rule;
	if (typeof rule === 'string' && Object.hasOwn(NORMALIZERS, rule)) {
		return NORMALIZERS[rule];
	}

	throw new TypeError(
		`${where} must be "none", "lowercase", "lowercaseTrim", "nfkcLowercaseTrim" or a function`,
	);
}
