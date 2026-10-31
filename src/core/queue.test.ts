import { beforeAll, describe, expect, it } from 'vitest';
import { buildQueue, Session } from './queue.ts';
import { createPlanner, formatInterval, RETIRE_MAX_DAYS, RETIRE_MIN_DAYS, type Planner } from './scheduler.ts';
import { DEFAULT_SETTINGS, dayStart, type CardState } from './state.ts';
import { cardId, type Direction, type Item } from './types.ts';

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
const DAY = 86_400_000;
let planner: Planner;

beforeAll(async () => {
  planner = await createPlanner({ desiredRetention: 0.9 }, () => 0.5);
});

function answer(states: Map<string, CardState>, it: Item, known: boolean, now: Date, direction: Direction = 'fr-de') {
  const id = cardId(it.id, direction);
  const { state, event } = planner.answer({
    state: states.get(id) ?? null,
    cardId: id,
    itemId: it.id,
    direction,
    known,
    now,
    shownAt: now,
    revealedAt: now,
    sessionId: 's',
    appVersion: 'test',
  });
  states.set(id, state);
  return { state, event };
}

const queue = (states: Map<string, CardState>, now = t0, list = items, directions: Direction[] = ['fr-de']) =>
  buildQueue({ items: list, states, now, settings: DEFAULT_SETTINGS, planner, directions });

describe('dayStart', () => {
  it('Lerntag wechselt um 4 Uhr', () => {
    expect(dayStart(new Date('2026-11-02T03:59:00')).getDate()).toBe(1);
    expect(dayStart(new Date('2026-11-02T04:00:00')).getDate()).toBe(2);
  });
});

describe('Antworten', () => {
  it('neu und gewusst → aussortiert, Stichprobe in 90–365 Tagen', () => {
    const { state, event } = answer(new Map(), items[0]!, true, t0);
    expect(state.status).toBe('retired');
    const days = (Date.parse(state.audit!.dueAt) - t0.getTime()) / DAY;
    expect(days).toBeGreaterThanOrEqual(RETIRE_MIN_DAYS);
    expect(days).toBeLessThanOrEqual(RETIRE_MAX_DAYS);
    expect(event).toMatchObject({ mode: 'triage', rating: 3, before: { status: 'new' }, after: { status: 'retired' } });
  });

  it('neu und nicht gewusst → Lernkarte, kommt in Minuten wieder', () => {
    const { state, event } = answer(new Map(), items[0]!, false, t0);
    expect(state.status).toBe('learning');
    expect(Date.parse(state.fsrs.dueAt) - t0.getTime()).toBeLessThan(15 * 60_000);
    expect(event).toMatchObject({ mode: 'triage', rating: 1 });
  });

  it('Stichprobe bestanden → Abstand wächst um Faktor 2,5', () => {
    const states = new Map<string, CardState>();
    const first = answer(states, items[0]!, true, t0).state;
    const later = new Date(first.audit!.dueAt);
    const { state, event } = answer(states, items[0]!, true, later);
    expect(state.status).toBe('retired');
    expect(state.audit!.intervalDays).toBe(Math.round(first.audit!.intervalDays * 2.5));
    expect(event.mode).toBe('audit');
  });

  it('Stichprobe verfehlt → normale Lernkarte', () => {
    const states = new Map<string, CardState>();
    const first = answer(states, items[0]!, true, t0).state;
    const { state, event } = answer(states, items[0]!, false, new Date(first.audit!.dueAt));
    expect(state.status).toBe('learning');
    expect(state.introducedAt).toBe(first.introducedAt);
    expect(event).toMatchObject({ mode: 'audit', rating: 1, before: { status: 'retired' } });
  });

  it('Lernkarte: gewusst = Gut, nicht gewusst = Nochmal', () => {
    const states = new Map<string, CardState>();
    answer(states, items[0]!, false, t0);
    const soon = new Date(t0.getTime() + 2 * 60_000);
    const { event } = answer(states, items[0]!, true, soon);
    expect(event).toMatchObject({ mode: 'review', rating: 3 });
  });

  it('Vorschau: neue Karte nennt einen Bereich für „gewusst“', () => {
    const p = planner.preview(null, t0);
    expect(p.unknown.getTime() - t0.getTime()).toBeLessThan(15 * 60_000);
    expect(p.known).toHaveProperty('from');
  });
});

describe('buildQueue', () => {
  it('liefert alle ungesehenen Karten gestreut, nicht alphabetisch, und stabil', () => {
    const q = queue(new Map());
    expect(q.fresh).toHaveLength(30);
    expect(q.newBudget).toBe(20);
    const ids = q.fresh.map((e) => e.item.id);
    expect(ids).not.toEqual([...ids].sort());
    expect(queue(new Map()).fresh.map((e) => e.cardId)).toEqual(q.fresh.map((e) => e.cardId));
  });

  it('nur nicht gewusste neue Karten verbrauchen Tagesbudget', () => {
    const states = new Map<string, CardState>();
    for (const it of items.slice(0, 10)) answer(states, it, true, t0);
    for (const it of items.slice(10, 15)) answer(states, it, false, t0);
    const q = queue(states, new Date('2026-11-02T18:00:00'));
    expect(q.summary).toMatchObject({ newToday: 5, retired: 10, unsorted: 15 });
    expect(q.newBudget).toBe(15);
  });

  it('fällige Karten zuerst, schwächste zuerst; Stichproben nur fällig und begrenzt', () => {
    const states = new Map<string, CardState>();
    const old = new Date('2026-10-01T09:00:00');
    answer(states, items[0]!, false, old);
    answer(states, items[0]!, true, new Date(old.getTime() + 11 * 60_000));
    answer(states, items[1]!, true, new Date('2025-01-01T09:00:00')); // aussortiert, Stichprobe längst fällig
    answer(states, items[2]!, true, t0); // heute aussortiert, nicht fällig
    const q = queue(states);
    expect(q.due.map((e) => e.item.id)).toEqual([items[0]!.id, items[1]!.id]);
  });

  it('zweite Richtung erst bei Stabilität > 7 Tagen oder wenn die Startkarte aussortiert ist', () => {
    const it = item('x', 'DE→FR');
    const states = new Map<string, CardState>();
    expect(queue(states, t0, [it], ['fr-de', 'de-fr']).fresh.map((e) => e.direction)).toEqual(['de-fr']);
    answer(states, it, true, new Date('2026-10-01T09:00:00'), 'de-fr');
    expect(queue(states, t0, [it], ['fr-de', 'de-fr']).fresh.map((e) => e.direction)).toEqual(['fr-de']);
  });

  it('Geschwisterkarte heute gesehen → Karte wartet bis morgen', () => {
    const it = item('y', 'DE→FR');
    const states = new Map<string, CardState>();
    answer(states, it, true, t0, 'de-fr');
    expect(queue(states, new Date('2026-11-02T10:00:00'), [it], ['fr-de', 'de-fr']).fresh).toEqual([]);
    expect(queue(states, new Date('2026-11-03T10:00:00'), [it], ['fr-de', 'de-fr']).fresh).toHaveLength(1);
  });

  it('Expressions erscheinen nur in der Erkennungsrichtung', () => {
    const e = item('e', 'FR→DE', true);
    expect(queue(new Map(), t0, [e], ['fr-de', 'de-fr']).fresh.map((x) => x.direction)).toEqual(['fr-de']);
  });
});

describe('Session', () => {
  const entry = (id: string) => ({ cardId: cardId(id, 'fr-de'), item: item(id), direction: 'fr-de' as const });

  it('gewusste neue Karten kosten kein Budget, nicht gewusste schon', () => {
    const states = new Map<string, CardState>();
    const fresh = ['a', 'b', 'c', 'd'].map(entry);
    const s = new Session({ due: [], fresh, newBudget: 1 }, states, planner, 50, 's');
    let now = t0;
    s.next(now);
    s.answer({ known: true, now, shownAt: now, revealedAt: now, appVersion: 't' }); // a aussortiert
    s.next(now);
    s.answer({ known: true, now, shownAt: now, revealedAt: now, appVersion: 't' }); // b aussortiert
    expect(s.next(now)?.item.id).toBe('c');
    s.answer({ known: false, now, shownAt: now, revealedAt: now, appVersion: 't' }); // Budget aufgebraucht
    now = new Date(t0.getTime() + 5_000);
    expect(s.next(now)?.item.id).toBe('c'); // kommt vorgezogen wieder, d nicht mehr
    s.answer({ known: true, now, shownAt: now, revealedAt: now, appVersion: 't' });
    const after = s.next(now);
    expect(after === null || after.item.id === 'c').toBe(true);
    expect([...states.values()].filter((x) => x.status === 'retired')).toHaveLength(2);
  });

  it('begrenzt die Sitzung auf die eingestellte Größe', () => {
    const s = new Session({ due: [], fresh: ['a', 'b', 'c'].map(entry), newBudget: 10 }, new Map(), planner, 2, 's');
    s.next(t0);
    s.answer({ known: true, now: t0, shownAt: t0, revealedAt: t0, appVersion: 't' });
    s.next(t0);
    s.answer({ known: true, now: t0, shownAt: t0, revealedAt: t0, appVersion: 't' });
    expect(s.next(t0)).toBeNull();
  });

  it('Rückgängig stellt Karte, Zustand, Budget und Reihenfolge wieder her', () => {
    const states = new Map<string, CardState>();
    const s = new Session({ due: [], fresh: ['a', 'b'].map(entry), newBudget: 1 }, states, planner, 50, 's');
    s.next(t0);
    const { event } = s.answer({ known: false, now: t0, shownAt: t0, revealedAt: t0, appVersion: 't' });
    expect(s.undo()).toEqual({ cardId: cardId('a', 'fr-de'), prev: null, eventId: event.id });
    expect(states.size).toBe(0);
    expect(s.current?.item.id).toBe('a');
    s.answer({ known: true, now: t0, shownAt: t0, revealedAt: t0, appVersion: 't' });
    expect(s.next(t0)?.item.id).toBe('b'); // Budget wieder 1
  });

  it('protokolliert Antwortzeiten', () => {
    const s = new Session({ due: [], fresh: [entry('a')], newBudget: 5 }, new Map(), planner, 50, 's3');
    s.next(t0);
    const shown = new Date(t0.getTime() - 3000);
    const revealed = new Date(t0.getTime() - 1000);
    const { event } = s.answer({ known: true, now: t0, shownAt: shown, revealedAt: revealed, appVersion: 't' });
    expect(event).toMatchObject({ revealMs: 2000, answerMs: 3000, sessionId: 's3', scheduler: 'ts-fsrs@6.0.0 FSRS-6' });
  });
});

describe('formatInterval', () => {
  it('formatiert Intervalle knapp', () => {
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    expect(formatInterval(t0, at(1))).toBe('1 Min');
    expect(formatInterval(t0, at(180))).toBe('3 Std');
    expect(formatInterval(t0, at(60 * 24 * 8))).toBe('8 T');
    expect(formatInterval(t0, at(60 * 24 * 90))).toBe('3 Mon');
    expect(formatInterval(t0, at(60 * 24 * 365 * 1.5))).toBe('1,5 J');
  });
});
