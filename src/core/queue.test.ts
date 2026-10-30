import { beforeAll, describe, expect, it } from 'vitest';
import { buildQueue, Session } from './queue.ts';
import { createPlanner, formatInterval, type Planner } from './scheduler.ts';
import { DEFAULT_SETTINGS, dayStart, type CardState } from './state.ts';
import { cardId, type Item } from './types.ts';

function item(id: string, richtung: Item['richtung'] = 'FR→DE', expression = false): Item {
  return {
    id,
    fr: `mot-${id}`,
    de: `Wort ${id}`,
    richtung,
    notiz: '',
    sicherheit: 'eigen',
    expression,
    directions: expression ? ['fr-de'] : richtung === 'DE→FR' ? ['de-fr', 'fr-de'] : ['fr-de', 'de-fr'],
    line: 1,
  };
}

const items = Array.from({ length: 30 }, (_, i) => item(`i${String(i).padStart(2, '0')}`));
const t0 = new Date('2026-11-02T09:00:00');
let planner: Planner;

beforeAll(async () => {
  planner = await createPlanner({ desiredRetention: 0.9 });
});

function rate(states: Map<string, CardState>, it: Item, grade: 1 | 2 | 3 | 4, now: Date, direction: 'fr-de' | 'de-fr' = 'fr-de') {
  const id = cardId(it.id, direction);
  const { state } = planner.rate({
    state: states.get(id) ?? null,
    cardId: id,
    itemId: it.id,
    direction,
    grade,
    now,
    shownAt: now,
    revealedAt: now,
    sessionId: 's',
    appVersion: 'test',
  });
  states.set(id, state);
  return state;
}

describe('dayStart', () => {
  it('Lerntag wechselt um 4 Uhr', () => {
    expect(dayStart(new Date('2026-11-02T03:59:00')).getDate()).toBe(1);
    expect(dayStart(new Date('2026-11-02T04:00:00')).getDate()).toBe(2);
  });
});

describe('buildQueue', () => {
  it('begrenzt neue Karten pro Tag und mischt sie stabil, nicht alphabetisch', () => {
    const q = buildQueue({ items, states: new Map(), now: t0, settings: DEFAULT_SETTINGS, planner, directions: ['fr-de'] });
    expect(q.entries).toHaveLength(20);
    expect(q.summary).toEqual({ due: 0, newAvailable: 20, newToday: 0 });
    const ids = q.entries.map((e) => e.item.id);
    expect(ids).not.toEqual([...ids].sort());
    const again = buildQueue({ items, states: new Map(), now: t0, settings: DEFAULT_SETTINGS, planner, directions: ['fr-de'] });
    expect(again.entries.map((e) => e.cardId)).toEqual(q.entries.map((e) => e.cardId));
  });

  it('zählt heute eingeführte Karten gegen das Tageslimit', () => {
    const states = new Map<string, CardState>();
    for (const it of items.slice(0, 15)) rate(states, it, 4, t0);
    const later = new Date('2026-11-02T18:00:00');
    const q = buildQueue({ items, states, now: later, settings: DEFAULT_SETTINGS, planner, directions: ['fr-de'] });
    expect(q.summary.newToday).toBe(15);
    expect(q.entries.filter((e) => !states.has(e.cardId))).toHaveLength(5);
  });

  it('fällige Karten vor neuen, schwächste (niedrigstes R) zuerst', () => {
    const states = new Map<string, CardState>();
    const a = items[0]!;
    const b = items[1]!;
    rate(states, a, 4, new Date('2026-10-01T09:00:00')); // lange her, Easy
    rate(states, b, 3, new Date('2026-10-01T09:00:00'));
    rate(states, b, 3, new Date('2026-10-01T09:15:00'));
    const q = buildQueue({ items, states, now: t0, settings: DEFAULT_SETTINGS, planner, directions: ['fr-de'] });
    const first = q.entries.slice(0, 2).map((e) => e.item.id);
    expect(first.sort()).toEqual([a.id, b.id].sort());
    const rA = planner.retrievability(states.get(cardId(a.id, 'fr-de'))!, t0);
    const rB = planner.retrievability(states.get(cardId(b.id, 'fr-de'))!, t0);
    expect(q.entries[0]!.item.id).toBe(rA < rB ? a.id : b.id);
    expect(q.summary.due).toBe(2);
  });

  it('schaltet die zweite Richtung erst bei Stabilität > 7 Tagen frei', () => {
    const it = item('x', 'DE→FR');
    const states = new Map<string, CardState>();
    const q1 = buildQueue({ items: [it], states, now: t0, settings: DEFAULT_SETTINGS, planner, directions: ['fr-de', 'de-fr'] });
    expect(q1.entries.map((e) => e.direction)).toEqual(['de-fr']);
    const s = rate(states, it, 4, new Date('2026-10-01T09:00:00'), 'de-fr');
    expect(s.fsrs.stability).toBeGreaterThan(7);
    const q2 = buildQueue({ items: [it], states, now: t0, settings: DEFAULT_SETTINGS, planner, directions: ['fr-de', 'de-fr'] });
    expect(q2.entries.map((e) => e.direction)).toContain('fr-de');
  });

  it('Geschwisterkarte heute bewertet → Karte wartet bis morgen', () => {
    const it = item('y');
    const states = new Map<string, CardState>();
    rate(states, it, 4, new Date('2026-10-01T09:00:00'));
    rate(states, it, 4, t0); // heute
    const q = buildQueue({ items: [it], states, now: new Date('2026-11-02T10:00:00'), settings: DEFAULT_SETTINGS, planner, directions: ['de-fr'] });
    expect(q.entries).toEqual([]);
  });

  it('Expressions erscheinen nur in der Erkennungsrichtung', () => {
    const e = item('e', 'FR→DE', true);
    const q = buildQueue({ items: [e], states: new Map(), now: t0, settings: DEFAULT_SETTINGS, planner, directions: ['fr-de', 'de-fr'] });
    expect(q.entries.map((x) => x.direction)).toEqual(['fr-de']);
  });
});

describe('Session', () => {
  it('Nochmal bringt die Karte in derselben Sitzung zurück', () => {
    const states = new Map<string, CardState>();
    const s = new Session([{ cardId: cardId('a', 'fr-de'), item: item('a'), direction: 'fr-de' }], states, planner, 's1');
    let now = t0;
    expect(s.next(now)?.item.id).toBe('a');
    s.answer({ grade: 1, now, shownAt: now, revealedAt: now, appVersion: 't' });
    now = new Date(t0.getTime() + 5_000);
    expect(s.next(now)?.item.id).toBe('a'); // vorgezogen, weil sonst nichts übrig
    s.answer({ grade: 4, now, shownAt: now, revealedAt: now, appVersion: 't' });
    expect(s.next(now)).toBeNull();
    expect(s.done).toBe(2);
  });

  it('Rückgängig stellt Karte, Zustand und Reihenfolge wieder her', () => {
    const states = new Map<string, CardState>();
    const entries = ['a', 'b'].map((id) => ({ cardId: cardId(id, 'fr-de'), item: item(id), direction: 'fr-de' as const }));
    const s = new Session(entries, states, planner, 's2');
    s.next(t0);
    const { event } = s.answer({ grade: 3, now: t0, shownAt: t0, revealedAt: t0, appVersion: 't' });
    expect(states.size).toBe(1);
    const u = s.undo();
    expect(u).toEqual({ cardId: entries[0]!.cardId, prev: null, eventId: event.id });
    expect(states.size).toBe(0);
    expect(s.current?.item.id).toBe('a');
    expect(s.done).toBe(0);
  });

  it('protokolliert Bewertung, Zustand davor/danach und Zeiten', () => {
    const states = new Map<string, CardState>();
    const s = new Session([{ cardId: cardId('a', 'fr-de'), item: item('a'), direction: 'fr-de' }], states, planner, 's3');
    s.next(t0);
    const shown = new Date(t0.getTime() - 3000);
    const revealed = new Date(t0.getTime() - 1000);
    const { event } = s.answer({ grade: 3, now: t0, shownAt: shown, revealedAt: revealed, appVersion: 't' });
    expect(event).toMatchObject({
      kind: 'review',
      rating: 3,
      revealMs: 2000,
      answerMs: 3000,
      before: { status: 'new' },
      rPred: null,
      sessionId: 's3',
      scheduler: 'ts-fsrs@6.0.0 FSRS-6',
    });
    expect(event.after.stability).toBeGreaterThan(0);
  });
});

describe('preview / formatInterval', () => {
  it('liefert vier aufsteigende Fälligkeiten', () => {
    const p = planner.preview(null, t0);
    expect(p[1] <= p[2] && p[2] <= p[3] && p[3] < p[4]).toBe(true);
  });

  it('formatiert Intervalle knapp', () => {
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    expect(formatInterval(t0, at(1))).toBe('1 Min');
    expect(formatInterval(t0, at(180))).toBe('3 Std');
    expect(formatInterval(t0, at(60 * 24 * 8))).toBe('8 T');
    expect(formatInterval(t0, at(60 * 24 * 90))).toBe('3 Mon');
    expect(formatInterval(t0, at(60 * 24 * 365 * 1.5))).toBe('1,5 J');
    expect(formatInterval(t0, at(60 * 24 * 365 * 2))).toBe('2 J');
  });
});
