import { describe, expect, it } from 'vitest';
import { buildRound, gamePool, optionText, pullForward, wordClass } from './game.ts';
import type { CardState } from './state.ts';
import type { Item } from './types.ts';

let n = 0;
function item(fr: string, de: string, expression = false): Item {
  return { id: `i${n++}`, fr, de, richtung: 'FR→DE', notiz: '', sicherheit: 'eigen', expression, directions: ['fr-de', 'de-fr'], line: 1 };
}

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

describe('wordClass', () => {
  it('erkennt Genus, Adjektiv, Verb und Wendung aus der CSV-Schreibweise', () => {
    expect(wordClass(item('essuie-glace (m)', 'x'))).toBe('nm');
    expect(wordClass(item('braise (f)', 'x'))).toBe('nf');
    expect(wordClass(item('effronté, -e (adj.)', 'x'))).toBe('adj');
    expect(wordClass(item('essorer', 'x'))).toBe('verb');
    expect(wordClass(item('à la longue', 'x', true))).toBe('wendung');
  });
});

describe('buildRound', () => {
  const target = item('essuie-glace (m)', 'Scheibenwischer');
  const pool = [
    target,
    item('balai (m)', 'Besen'),
    item('torchon (m)', 'Geschirrtuch; Lappen'),
    item('rétroviseur (m)', 'Rückspiegel'),
    item('braise (f)', 'Glut'),
    item('essuie-glace (m)', 'Scheibenwischer'), // Dublette mit gleicher Bedeutung
    item('frotter', 'reiben; Scheibenwischer'), // teilt eine Bedeutung
  ];

  it('liefert vier verschiedene Antworten mit genau einer richtigen', () => {
    const r = buildRound(target, pool, seq(0.1, 0.7, 0.3, 0.9, 0.5));
    expect(r.options).toHaveLength(4);
    expect(r.options.filter((o) => o.item.id === target.id)).toHaveLength(1);
    expect(new Set(r.options.map((o) => o.text)).size).toBe(4);
  });

  it('nimmt keine Synonyme oder Dubletten als Ablenker und bevorzugt die gleiche Wortklasse', () => {
    const r = buildRound(target, pool, seq(0.2, 0.4, 0.6, 0.8));
    const texts = r.options.map((o) => o.text);
    expect(texts.filter((t) => t === 'Scheibenwischer')).toHaveLength(1);
    expect(texts).not.toContain('reiben');
    expect(r.options.filter((o) => o.item.id !== target.id).every((o) => wordClass(o.item) === 'nm')).toBe(true);
  });

  it('Antworttext ist die erste Bedeutung', () => {
    expect(optionText(item('esquiver', "1. (Schlag) ausweichen 2. umgehen"))).toBe('(Schlag) ausweichen');
  });
});

describe('gamePool', () => {
  it('nimmt gesehene Wörter, sobald es genug gibt', () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`mot${i}`, `Wort${i}`));
    const states = new Map<string, CardState>([[`${items[0]!.id}/fr-de`, {} as CardState]]);
    expect(gamePool(items, states, 1).map((i) => i.id)).toEqual([items[0]!.id]);
    expect(gamePool(items, states, 2)).toHaveLength(5);
  });
});

describe('pullForward', () => {
  const now = new Date('2026-11-02T10:00:00');
  const tomorrow = new Date('2026-11-03T04:00:00').toISOString();
  const base = { cardId: 'a/fr-de', itemId: 'a', direction: 'fr-de' as const, introducedAt: '' };

  it('zieht aussortierte und gefestigte Karten auf morgen vor', () => {
    const retired = { ...base, status: 'retired', fsrs: {} as never, audit: { dueAt: '2027-05-01T00:00:00.000Z', intervalDays: 180, lastAt: '' } } as CardState;
    expect(pullForward(retired, now)?.audit?.dueAt).toBe(tomorrow);
    const mature = { ...base, status: 'review', fsrs: { stability: 40, dueAt: '2027-01-01T00:00:00.000Z' } as never } as CardState;
    expect(pullForward(mature, now)?.fsrs.dueAt).toBe(tomorrow);
  });

  it('lässt junge, ohnehin bald fällige oder unbekannte Karten in Ruhe', () => {
    const young = { ...base, status: 'review', fsrs: { stability: 5, dueAt: '2027-01-01T00:00:00.000Z' } as never } as CardState;
    expect(pullForward(young, now)).toBeNull();
    expect(pullForward(undefined, now)).toBeNull();
  });
});
