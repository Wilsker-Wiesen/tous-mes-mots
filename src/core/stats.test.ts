import { describe, expect, it } from 'vitest';
import type { CardState, GameEvent, LogEvent, ReviewEvent } from './state.ts';
import { activity, calibration, effectiveReviews, gameRuns, inventory, longestRun, median, records, retention, weaknesses, DIMENSIONS, wilson } from './stats.ts';
import type { Item } from './types.ts';

let n = 0;
function review(ts: string, known: boolean, extra: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    kind: 'review',
    id: `r${n++}`,
    ts,
    sessionId: 's',
    cardId: 'a/fr-de',
    itemId: 'a',
    direction: 'fr-de',
    format: 'flip',
    mode: 'review',
    rating: known ? 3 : 1,
    shownAt: ts,
    revealMs: 1000,
    answerMs: 2000,
    before: { status: 'review', stability: 5, difficulty: 5, dueAt: null },
    after: { status: 'review', stability: 9, difficulty: 5, dueAt: null, scheduledDays: 9 },
    rPred: 0.9,
    elapsedDays: 5,
    scheduler: 'x',
    desiredRetention: 0.9,
    appVersion: 't',
    ...extra,
  };
}
function move(ts: string, sessionId: string, game: 'sprint' | 'sudden', correct: boolean): GameEvent {
  return { kind: 'game', id: `g${n++}`, ts, sessionId, game, cardId: 'a/fr-de', itemId: 'a', correct, chosenItemId: null, optionItemIds: [], latencyMs: 900 };
}
const item = (id: string, fr: string, sicherheit: Item['sicherheit'] = 'eigen'): Item => ({
  id,
  fr,
  de: 'x',
  richtung: 'FR→DE',
  notiz: '',
  sicherheit,
  expression: false,
  directions: ['fr-de', 'de-fr'],
  line: 1,
});

describe('effectiveReviews', () => {
  it('zählt zurückgenommene Bewertungen nicht', () => {
    const a = review('2026-11-01T10:00:00', true);
    const b = review('2026-11-01T10:01:00', false);
    const events: LogEvent[] = [a, b, { kind: 'undo', id: 'u', ts: '2026-11-01T10:02:00', targetId: b.id }];
    expect(effectiveReviews(events).map((e) => e.id)).toEqual([a.id]);
  });
});

describe('inventory', () => {
  it('eine Zahl pro Wort, nach Zustand', () => {
    const items = [item('a', 'a'), item('b', 'b'), item('c', 'c'), item('d', 'd'), item('e', 'e')];
    const st = (id: string, status: CardState['status'], stability = 1) =>
      [`${id}/fr-de`, { cardId: `${id}/fr-de`, itemId: id, direction: 'fr-de', status, fsrs: { stability } as never, introducedAt: '' }] as const;
    const states = new Map<string, CardState>([st('a', 'retired'), st('b', 'learning'), st('c', 'review', 5), st('d', 'review', 30)] as never);
    expect(inventory(items, states)).toEqual({ unsorted: 1, learning: 1, young: 1, mature: 1, retired: 1 });
  });
});

describe('retention', () => {
  const now = new Date('2026-11-14T12:00:00');
  const events = [
    // Vorperiode (Woche davor): 1 von 2
    review('2026-11-02T10:00:00', true),
    review('2026-11-03T10:00:00', false),
    // aktuelle 7 Tage: 3 von 4, dazu Sortierphase
    review('2026-11-09T10:00:00', true),
    review('2026-11-10T10:00:00', true),
    review('2026-11-11T10:00:00', false),
    review('2026-11-12T10:00:00', true),
    review('2026-11-12T10:05:00', true, { mode: 'triage' }),
    review('2026-11-12T10:06:00', false, { mode: 'triage' }),
  ];

  it('Quote im Fenster, Vergleich mit der Vorperiode, Sortierphase getrennt', () => {
    const v = retention(events, now, 7);
    expect(v).toMatchObject({ n: 4, rate: 0.75, prevN: 2, prevRate: 0.5, triageN: 2, triageRate: 0.5, bucket: 'Tag' });
    expect(v.points).toHaveLength(7);
    expect(v.points.reduce((s, p) => s + p.n, 0)).toBe(4);
  });

  it('wählt größere Zeiteinheiten für lange Fenster', () => {
    expect(retention(events, now, 90).bucket).toBe('Woche');
    expect(retention(events, now, 365).bucket).toBe('Monat');
  });
});

describe('calibration', () => {
  it('ordnet Vorhersagen in Zehntelklassen und vergleicht', () => {
    const bins = calibration([review('2026-11-01T10:00:00', true, { rPred: 0.95 }), review('2026-11-01T10:00:00', false, { rPred: 0.91 }), review('2026-11-01T10:00:00', true, { rPred: 0.42 })]);
    expect(bins[9]).toMatchObject({ n: 2, observed: 0.5 });
    expect(bins[9]!.predicted).toBeCloseTo(0.93);
    expect(bins[4]).toMatchObject({ n: 1, observed: 1 });
  });
});

describe('Aktivität, Serien, Rekorde', () => {
  it('Lerntag wechselt um 4 Uhr', () => {
    const a = activity([review('2026-11-02T03:00:00', true), review('2026-11-02T05:00:00', true)]);
    expect([...a.keys()]).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('ein freier Tag unterbricht die Serie nicht, zwei schon', () => {
    expect(longestRun(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'])).toBe(4);
    expect(longestRun(['2026-11-01', '2026-11-04'])).toBe(1);
  });

  it('rekonstruiert Spielläufe und Bestwerte', () => {
    const events = [move('2026-11-01T10:00:00', 'x', 'sprint', true), move('2026-11-01T10:00:01', 'x', 'sprint', true), move('2026-11-01T10:00:02', 'x', 'sprint', false), move('2026-11-02T10:00:00', 'y', 'sudden', true), move('2026-11-02T10:00:01', 'y', 'sudden', false)];
    expect(gameRuns(events).map((r) => [r.mode, r.score])).toEqual([
      ['sprint', 1],
      ['sudden', 1],
    ]);
    const rec = records(events);
    expect(rec.find((r) => r.label === '60 Sekunden')).toMatchObject({ value: 1, date: '2026-11-01T10:00:00' });
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('weaknesses', () => {
  it('beobachtet minus erwartet je Kategorie, schwächste zuerst, Mindestanzahl', () => {
    const items = new Map([
      ['a', item('a', 'essorer')],
      ['b', item('b', 'braise (f)')],
    ]);
    const reviews = [
      ...Array.from({ length: 30 }, (_, i) => review('2026-11-01T10:00:00', i < 15, { itemId: 'b', rPred: 0.9 })),
      ...Array.from({ length: 5 }, () => review('2026-11-01T10:00:00', true, { itemId: 'a', rPred: 0.8 })),
    ];
    const f = weaknesses(reviews, items, DIMENSIONS.find((d) => d.key === 'class')!);
    expect(f[0]).toMatchObject({ value: 'Nomen (f)', n: 30, reliable: true });
    expect(f[0]!.diff).toBeCloseTo(-0.4);
    expect(f[1]).toMatchObject({ value: 'Verb', n: 5, reliable: false });
  });

  it('Wilson-Intervall', () => {
    const [lo, hi] = wilson(15, 30);
    expect(lo).toBeCloseTo(0.332, 2);
    expect(hi).toBeCloseTo(0.668, 2);
  });
});
