/**
 * A deep copy: every record goes in and comes out through it, so a caller that
 * mutates what it passed or what it got back cannot reach the store.
 */
export const copy = <T>(value: T): T => structuredClone(value);
