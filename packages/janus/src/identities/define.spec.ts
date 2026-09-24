import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { defineIdentities, resolveConfig } from './define';
import type { IdentitiesConfig } from './types';

const traits = z.object({ email: z.string() });
const base = {
	traits,
	identifiers: { password: { from: 'email', normalize: 'lowercaseTrim' } },
} as const;

/** Refused at run time: the net for callers the compiler never saw. */
const define = (config: unknown) => () =>
	defineIdentities(config as IdentitiesConfig as never);

describe('defineIdentities', () => {
	it('describes and touches nothing', () => {
		const definition = defineIdentities(base);

		expect(definition.kind).toBe('janus.identities');
		expect(definition.config).toBe(base);
	});

	it('applies the defaults, each the strict one', () => {
		const resolved = resolveConfig(base, 'defineIdentities');

		expect(resolved.schemaVersion).toBe('1');
		expect(resolved.minLength).toBe(8);
		expect(resolved.lifespanMs).toBe(24 * 3_600_000);
		expect(resolved.earliestRefreshMs).toBeNull();
		expect(resolved.tokenTtlMs).toEqual({
			verification: 3_600_000,
			recovery: 15 * 60_000,
		});
		expect(resolved.cookie).toEqual({
			name: 'janus-session',
			domain: null,
			path: '/',
			sameSite: 'lax',
			secure: true,
		});
	});

	it('normalises as it is told, and only as it is told', () => {
		const rules = [
			'none',
			'lowercase',
			'lowercaseTrim',
			'nfkcLowercaseTrim',
		] as const;
		const answers = rules.map((normalize) =>
			resolveConfig(
				{ traits, identifiers: { password: { from: 'email', normalize } } },
				'x',
			).identifiers[0]?.normalize(' Ｂob@X.test '),
		);

		expect(answers).toEqual([
			' Ｂob@X.test ',
			' ｂob@x.test ',
			'ｂob@x.test',
			'bob@x.test',
		]);
	});

	describe('refuses, with a bare TypeError, what only wiring produces', () => {
		const cases: [string, unknown, string][] = [
			['no traits', { identifiers: {} }, 'traits must be a Standard Schema'],
			[
				'traits that are not a schema',
				{ traits: {}, identifiers: {} },
				'traits must be a Standard Schema',
			],
			[
				'an identifier with no normalize',
				{ traits, identifiers: { password: { from: 'email' } } },
				'there is no default',
			],
			[
				'an unknown normalize',
				{
					traits,
					identifiers: { password: { from: 'email', normalize: 'casefold' } },
				},
				'identifiers.password.normalize',
			],
			[
				'a from that is no path',
				{
					traits,
					identifiers: { password: { from: 'a..b', normalize: 'none' } },
				},
				'identifiers.password.from',
			],
			[
				'a verification.from that is no path',
				{ ...base, verification: { from: '' } },
				'verification.from',
			],
			[
				'a lifespan that is not a duration',
				{ ...base, session: { lifespan: '720hours' } },
				'session.lifespan',
			],
			[
				'a zero duration',
				{ ...base, tokens: { recovery: 0 } },
				'tokens.recovery',
			],
			[
				'a minLength under 1',
				{ ...base, password: { minLength: 0 } },
				'password.minLength',
			],
			[
				'a cookie name with a space',
				{ ...base, cookie: { name: 'my session' } },
				'cookie.name',
			],
			[
				'SameSite=None without Secure',
				{ ...base, cookie: { sameSite: 'none', secure: false } },
				'requires cookie.secure',
			],
		];

		for (const [name, config, message] of cases) {
			it(name, () => {
				expect(define(config)).toThrow(TypeError);
				expect(define(config)).toThrow(message);
			});
		}
	});
});
