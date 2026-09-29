import { describe, expect, test } from 'bun:test';
import { LOCALES } from './generated/locales';
import { NO_LOCATION, noLocationText } from './no-location';

describe('noLocationText', () => {
	test('a built locale: its own text', () => {
		expect(noLocationText('en')).toBe('Unknown location');
		expect(noLocationText('fr')).toBe('Lieu inconnu');
	});

	test('a regional locale: its language', () => {
		expect(noLocationText('fr-CA')).toBe('Lieu inconnu');
		expect(noLocationText('en-GB')).toBe('Unknown location');
	});

	test('a locale beyond the built ones: en', () => {
		expect(noLocationText('de')).toBe('Unknown location');
		expect(noLocationText('pt-BR')).toBe('Unknown location');
	});

	test('a text for every built locale, and no other', () => {
		expect(Object.keys(NO_LOCATION).sort()).toEqual([...LOCALES].sort());
	});
});
