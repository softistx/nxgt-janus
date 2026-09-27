/** What every step of resolving shares: a refusal naming where, and a record read from anything. */

export type Refuse = (message: string) => TypeError;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
