import { describe, expect, it } from 'vitest';
import { filterItems } from './filter.ts';
import type { Item } from './types.ts';

const item = (fr: string, de: string, sicherheit: Item['sicherheit'] = 'eigen', expression = false): Item => ({
  id: fr,
  fr,
  de,
  richtung: 'FR→DE',
  notiz: '',
  sicherheit,
  expression,
  directions: ['fr-de'],
  line: 1,
});

const items = [
  item('essorer', 'schleudern (Wäsche)'),
  item('abattis (m)', 'Verhau', 'eigen?'),
  item('à la longue', 'auf die Dauer', 'Vorlage', true),
  item('échancrure (f)', 'Ausschnitt'),
];

describe('filterItems', () => {
  it('ohne Filter alles', () => {
    expect(filterItems(items, { hideUncertain: false, onlyExpressions: false })).toHaveLength(4);
  });

  it('blendet unsichere Einträge aus', () => {
    expect(filterItems(items, { hideUncertain: true, onlyExpressions: false }).map((i) => i.fr)).not.toContain('abattis (m)');
  });

  it('nur Wendungen', () => {
    expect(filterItems(items, { hideUncertain: false, onlyExpressions: true }).map((i) => i.fr)).toEqual(['à la longue']);
  });

  it('Suche ignoriert Akzente und findet auch im Deutschen', () => {
    const f = { hideUncertain: false, onlyExpressions: false };
    expect(filterItems(items, { ...f, search: 'echancr' }).map((i) => i.fr)).toEqual(['échancrure (f)']);
    expect(filterItems(items, { ...f, search: 'Wäsche' }).map((i) => i.fr)).toEqual(['essorer']);
  });
});
