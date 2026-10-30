import { describe, expect, it } from 'vitest';
import { frSegments, meaningLines } from './display.ts';
import { activeStates, statesToDelete } from './reconcile.ts';
import type { CardState } from './state.ts';

describe('frSegments', () => {
  it('stellt Klammerzusätze getrennt dar', () => {
    expect(frSegments('essuie-glace (m)')).toEqual([
      { text: 'essuie-glace ', note: false },
      { text: '(m)', note: true },
    ]);
    expect(frSegments("(s')approcher (de) qn").map((s) => s.note)).toEqual([true, false, true, false]);
  });

  it('kann das Genus verbergen, andere Zusätze bleiben', () => {
    expect(frSegments('braise (f); brasier (m)', { hideGender: true }).map((s) => s.text).join('')).toBe('braise ; brasier ');
    expect(frSegments('effronté, -e (adj.)', { hideGender: true }).some((s) => s.text === '(adj.)')).toBe(true);
  });
});

describe('meaningLines', () => {
  it('bricht an ; und an Nummerierung um', () => {
    expect(meaningLines("1. (Schlag) ausweichen 2. umgehen; s'esquiver = sich davonstehlen")).toEqual([
      { text: '(Schlag) ausweichen', num: 1, example: false },
      { text: 'umgehen', num: 2, example: false },
      { text: "s'esquiver = sich davonstehlen", num: null, example: true },
    ]);
    expect(meaningLines('schleudern (Wäsche); auswringen').map((l) => l.text)).toEqual(['schleudern (Wäsche)', 'auswringen']);
  });
});

describe('reconcile', () => {
  const st = (itemId: string): CardState =>
    ({ cardId: `${itemId}/fr-de`, itemId, direction: 'fr-de', status: 'review', fsrs: {} as never, introducedAt: '' }) as CardState;
  const file = {
    items: [{ id: 'a' }, { id: 'b' }] as never[],
    orphans: [{ id: 'w', fr: 'x', richtung: 'FR→DE' as const, since: '2026-10-30' }],
  };

  it('löscht nur Zustände ohne Zeile und ohne Waiseneintrag', () => {
    expect(statesToDelete([st('a'), st('w'), st('weg')], file)).toEqual(['weg/fr-de']);
  });

  it('aktive Zustände schließen Waisen aus', () => {
    expect([...activeStates([st('a'), st('w')], file).keys()]).toEqual(['a/fr-de']);
  });
});
