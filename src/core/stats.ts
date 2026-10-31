// Statistik: alles wird aus dem unveränderlichen Ereignisprotokoll berechnet (Vorbild chess.com: Rohdaten
// bleiben, Kennzahlen werden abgeleitet). Siehe docs/recherche/chesscom_statistik.md.

import { MATURE_DAYS, wordClass } from './game.ts';
import type { CardState, GameEvent, GameMode, LogEvent, ReviewEvent } from './state.ts';
import { dayStart } from './state.ts';
import type { Item } from './types.ts';

/** Unter dieser Zahl von Abfragen wird ein Wert nur grau angezeigt (Konzept 8.3). */
export const MIN_N = 30;
const DAY = 86_400_000;

/** Bewertungen ohne die per Rückgängig zurückgenommenen. */
export function effectiveReviews(events: LogEvent[]): ReviewEvent[] {
  const undone = new Set(events.filter((e) => e.kind === 'undo').map((e) => (e as { targetId: string }).targetId));
  return events.filter((e): e is ReviewEvent => e.kind === 'review' && !undone.has(e.id));
}

export function gameEvents(events: LogEvent[]): GameEvent[] {
  return events.filter((e): e is GameEvent => e.kind === 'game');
}

/** Lokales Datum des Lerntags (Wechsel um 4 Uhr) als JJJJ-MM-TT. */
export function dayKey(ts: string | Date): string {
  const d = dayStart(new Date(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- Bestand

export interface Inventory {
  unsorted: number;
  learning: number;
  young: number;
  mature: number;
  retired: number;
}

/** Bestand der Erkennungskarten (fr-de): eine Zahl pro Wort, damit die Summe den Einträgen entspricht. */
export function inventory(items: Item[], states: Map<string, CardState>): Inventory {
  const inv: Inventory = { unsorted: 0, learning: 0, young: 0, mature: 0, retired: 0 };
  for (const item of items) {
    if (!item.directions.includes('fr-de')) continue;
    const s = states.get(`${item.id}/fr-de`);
    if (!s) inv.unsorted++;
    else if (s.status === 'retired') inv.retired++;
    else if (s.status !== 'review') inv.learning++;
    else if (s.fsrs.stability >= MATURE_DAYS) inv.mature++;
    else inv.young++;
  }
  return inv;
}

// ---------------------------------------------------------------- Abrufquote im Zeitverlauf

export type Window = 7 | 30 | 90 | 365 | 0;

export interface RatePoint {
  start: Date;
  n: number;
  known: number;
  rate: number | null;
}

export interface RetentionView {
  /** Abfragen von bereits begonnenen Karten (review, audit). */
  n: number;
  rate: number | null;
  /** Gleiche Kennzahl im gleich langen Zeitraum davor (nicht bei „gesamt“). */
  prevN: number;
  prevRate: number | null;
  /** Neue Karten, die man beim ersten Sehen wusste. */
  triageN: number;
  triageRate: number | null;
  points: RatePoint[];
  bucket: 'Tag' | 'Woche' | 'Monat';
}

const rate = (known: number, n: number) => (n > 0 ? known / n : null);

function bucketStart(d: Date, bucket: RetentionView['bucket']): Date {
  const s = dayStart(d);
  if (bucket === 'Woche') s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Montag
  if (bucket === 'Monat') s.setDate(1);
  return s;
}

function nextBucket(d: Date, bucket: RetentionView['bucket']): Date {
  const n = new Date(d);
  if (bucket === 'Tag') n.setDate(n.getDate() + 1);
  else if (bucket === 'Woche') n.setDate(n.getDate() + 7);
  else n.setMonth(n.getMonth() + 1);
  return n;
}

export function retention(reviews: ReviewEvent[], now: Date, window: Window): RetentionView {
  const known = (e: ReviewEvent) => e.rating === 3;
  const end = now.getTime();
  const first = reviews.length > 0 ? Math.min(...reviews.map((e) => Date.parse(e.ts))) : end;
  const from = window === 0 ? dayStart(new Date(first)).getTime() : dayStart(new Date(end - (window - 1) * DAY)).getTime();
  const span = end - from;
  const inWin = reviews.filter((e) => Date.parse(e.ts) >= from && Date.parse(e.ts) <= end);
  const prev = window === 0 ? [] : reviews.filter((e) => Date.parse(e.ts) >= from - span && Date.parse(e.ts) < from);
  const recall = (list: ReviewEvent[]) => list.filter((e) => e.mode !== 'triage');
  const triage = inWin.filter((e) => e.mode === 'triage');

  const days = span / DAY;
  const bucket: RetentionView['bucket'] = days <= 31 ? 'Tag' : days <= 200 ? 'Woche' : 'Monat';
  const points: RatePoint[] = [];
  for (let b = bucketStart(new Date(from), bucket); b.getTime() <= end; b = nextBucket(b, bucket)) {
    const nb = nextBucket(b, bucket).getTime();
    const list = recall(inWin).filter((e) => Date.parse(e.ts) >= b.getTime() && Date.parse(e.ts) < nb);
    const k = list.filter(known).length;
    points.push({ start: new Date(b), n: list.length, known: k, rate: rate(k, list.length) });
  }

  const r = recall(inWin);
  const p = recall(prev);
  return {
    n: r.length,
    rate: rate(r.filter(known).length, r.length),
    prevN: p.length,
    prevRate: rate(p.filter(known).length, p.length),
    triageN: triage.length,
    triageRate: rate(triage.filter(known).length, triage.length),
    points,
    bucket,
  };
}

// ---------------------------------------------------------------- Kalibrierung

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  predicted: number | null;
  observed: number | null;
}

/** Vorhergesagte Abrufwahrscheinlichkeit (FSRS) gegen tatsächliche Quote, in Zehntel-Klassen. */
export function calibration(reviews: ReviewEvent[]): CalibrationBin[] {
  const bins: CalibrationBin[] = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10, n: 0, predicted: null, observed: null }));
  const sums = bins.map(() => ({ p: 0, k: 0 }));
  for (const e of reviews) {
    if (e.rPred === null || e.mode === 'triage') continue;
    const i = Math.min(9, Math.max(0, Math.floor(e.rPred * 10)));
    bins[i]!.n++;
    sums[i]!.p += e.rPred;
    if (e.rating === 3) sums[i]!.k++;
  }
  bins.forEach((b, i) => {
    if (b.n > 0) {
      b.predicted = sums[i]!.p / b.n;
      b.observed = sums[i]!.k / b.n;
    }
  });
  return bins;
}

// ---------------------------------------------------------------- Aktivität

/** Antworten pro Lerntag (Abfragen und Spielzüge). */
export function activity(events: LogEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of [...effectiveReviews(events), ...gameEvents(events)]) {
    const k = dayKey(e.ts);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Längste Folge aktiver Tage; ein einzelner freier Tag unterbricht nicht (Kulanz wie bei chess.com). */
export function longestRun(days: Iterable<string>, graceDays = 1): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = Date.parse(`${d}T12:00:00`);
    run = prev !== null && (t - prev) / DAY <= 1 + graceDays + 0.01 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

// ---------------------------------------------------------------- Spiele und Rekorde

export interface GameRun {
  mode: GameMode;
  sessionId: string;
  ts: string;
  score: number;
  hits: number;
  misses: number;
}

/** Spielläufe aus den Spielzügen rekonstruieren (ein Lauf = eine sessionId). */
export function gameRuns(events: LogEvent[]): GameRun[] {
  const runs = new Map<string, GameRun>();
  for (const g of gameEvents(events)) {
    const r = runs.get(g.sessionId) ?? { mode: g.game, sessionId: g.sessionId, ts: g.ts, score: 0, hits: 0, misses: 0 };
    if (g.correct) r.hits++;
    else r.misses++;
    r.score = r.mode === 'sprint' ? r.hits - r.misses : r.hits;
    runs.set(g.sessionId, r);
  }
  return [...runs.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface StatRecord {
  label: string;
  value: number;
  date: string | null;
}

export function records(events: LogEvent[]): StatRecord[] {
  const reviews = effectiveReviews(events);
  const runs = gameRuns(events);
  const best = (mode: GameMode): StatRecord => {
    const top = runs.filter((r) => r.mode === mode).reduce<GameRun | null>((a, r) => (!a || r.score > a.score ? r : a), null);
    return { label: mode === 'sprint' ? '60 Sekunden' : 'Sudden Death', value: top?.score ?? 0, date: top?.ts ?? null };
  };
  const act = activity(events);
  let topDay: [string, number] | null = null;
  for (const [d, n] of act) if (!topDay || n > topDay[1]) topDay = [d, n];
  return [
    best('sprint'),
    best('sudden'),
    { label: 'Antworten an einem Tag', value: topDay?.[1] ?? 0, date: topDay ? `${topDay[0]}T12:00:00` : null },
    { label: 'Aktive Tage am Stück', value: longestRun(act.keys()), date: null },
    { label: 'Beim ersten Sehen gewusst', value: reviews.filter((e) => e.mode === 'triage' && e.rating === 3).length, date: null },
    { label: 'Aktive Tage insgesamt', value: act.size, date: null },
  ];
}

// ---------------------------------------------------------------- Schwächen nach Kategorie

export interface Facet {
  value: string;
  n: number;
  observed: number;
  predicted: number;
  /** beobachtet − erwartet; negativ = schwächer als FSRS erwartet. */
  diff: number;
  /** 95-%-Wilson-Intervall der beobachteten Quote. */
  low: number;
  high: number;
  reliable: boolean;
}

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - r) / d, (c + r) / d];
}

const CLASS_LABEL: { [k: string]: string } = {
  nm: 'Nomen (m)',
  nf: 'Nomen (f)',
  adj: 'Adjektiv',
  verb: 'Verb',
  wendung: 'Wendung',
  sonst: 'Sonstiges',
};

export const DIMENSIONS: { key: string; label: string; of: (item: Item, e: ReviewEvent) => string }[] = [
  { key: 'direction', label: 'Richtung', of: (_i, e) => (e.direction === 'fr-de' ? 'FR → DE' : 'DE → FR') },
  { key: 'class', label: 'Wortart', of: (i) => CLASS_LABEL[wordClass(i)] ?? 'Sonstiges' },
  { key: 'sicherheit', label: 'Sicherheit', of: (i) => i.sicherheit },
  { key: 'format', label: 'Format', of: (_i, e) => (e.format === 'typed' ? 'getippt' : 'umgedreht') },
];

/**
 * Schwächen je Kategorie: beobachtete minus von FSRS vorhergesagte Abrufquote. Die Vorhersage rechnet ein,
 * wie schwer und wie lange her die Wörter waren; so wird „Verben schwach“ von „Verben selten geübt“ getrennt.
 */
export function weaknesses(reviews: ReviewEvent[], items: Map<string, Item>, dim: (typeof DIMENSIONS)[number]): Facet[] {
  const groups = new Map<string, { n: number; k: number; p: number }>();
  for (const e of reviews) {
    if (e.rPred === null || e.mode === 'triage') continue;
    const item = items.get(e.itemId);
    if (!item) continue;
    const key = dim.of(item, e);
    const g = groups.get(key) ?? { n: 0, k: 0, p: 0 };
    g.n++;
    g.p += e.rPred;
    if (e.rating === 3) g.k++;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([value, g]) => {
      const [low, high] = wilson(g.k, g.n);
      const observed = g.k / g.n;
      const predicted = g.p / g.n;
      return { value, n: g.n, observed, predicted, diff: observed - predicted, low, high, reliable: g.n >= MIN_N };
    })
    .sort((a, b) => a.diff - b.diff);
}

/** Beim ersten Sehen gewusst, je Kategorie (zeigt, wo der Wortschatz schon sitzt). */
export function triageByFacet(reviews: ReviewEvent[], items: Map<string, Item>, dim: (typeof DIMENSIONS)[number]) {
  const groups = new Map<string, { n: number; k: number }>();
  for (const e of reviews) {
    if (e.mode !== 'triage') continue;
    const item = items.get(e.itemId);
    if (!item) continue;
    const key = dim.of(item, e);
    const g = groups.get(key) ?? { n: 0, k: 0 };
    g.n++;
    if (e.rating === 3) g.k++;
    groups.set(key, g);
  }
  return [...groups.entries()].map(([value, g]) => ({ value, n: g.n, rate: g.k / g.n })).sort((a, b) => a.rate - b.rate);
}
