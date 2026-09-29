import { describe, expect, test } from 'bun:test';
import { LOCALES } from './generated/locales';
import { NO_LOCATION, noLocationText } from './no-location';

describe('noLocationText', () => {
	test('a built locale: its own text', () => {
		expect(noLocationText('en')).toBe('Unknown');
		expect(noLocationText('fr')).toBe('Inconnu');
	});

	test('a regional locale: its language', () => {
		expect(noLocationText('fr-CA')).toBe('Inconnu');
		expect(noLocationText('en-GB')).toBe('Unknown');
	});

	test('a locale beyond the built ones: en', () => {
		expect(noLocationText('de')).toBe('Unknown');
		expect(noLocationText('pt-BR')).toBe('Unknown');
	});

	test('a text for every built locale, and no other', () => {
		expect(Object.keys(NO_LOCATION).sort()).toEqual([...LOCALES].sort());
	});
});
