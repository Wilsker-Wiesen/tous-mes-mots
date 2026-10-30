// Auswahl der Karten für eine Sitzung und Ablauf innerhalb der Sitzung (rein, ohne Speicher).

import { createHash } from './hash.ts';
import type { Planner } from './scheduler.ts';
import type { CardState, Grade, ReviewEvent, Settings } from './state.ts';
import { dayStart } from './state.ts';
import { cardId, type Direction, type Item } from './types.ts';

/** Die zweite Richtung einer Zeile wird erst freigeschaltet, wenn die Startkarte so stabil ist (Tage). */
export const UNLOCK_STABILITY_DAYS = 7;
/** Lernschritte, die in so vielen Minuten fällig werden, kommen noch in derselben Sitzung dran. */
export const LEARN_AHEAD_MIN = 20;

export interface QueueEntry {
  cardId: string;
  item: Item;
  direction: Direction;
}

export interface QueueInput {
  items: Item[];
  states: Map<string, CardState>;
  now: Date;
  settings: Settings;
  planner: Pick<Planner, 'retrievability'>;
  /** Welche Richtungen abgefragt werden (Schritt 2: nur Erkennen). */
  directions: Direction[];
}

export interface QueueSummary {
  due: number;
  newAvailable: number;
  newToday: number;
}

function isUnlocked(item: Item, direction: Direction, states: Map<string, CardState>): boolean {
  const primary = item.directions[0];
  if (direction === primary) return true;
  if (!item.directions.includes(direction) || !primary) return false;
  const p = states.get(cardId(item.id, primary));
  return !!p && p.fsrs.stability > UNLOCK_STABILITY_DAYS;
}

/** Geschwisterkarte heute schon bewertet? Dann wartet diese Karte bis morgen. */
function siblingSeenToday(item: Item, direction: Direction, states: Map<string, CardState>, today: Date): boolean {
  return item.directions.some((d) => {
    if (d === direction) return false;
    const last = states.get(cardId(item.id, d))?.fsrs.lastReviewAt;
    return !!last && new Date(last) >= today;
  });
}

/** Stabile, nicht alphabetische Reihenfolge für neue Karten (vermeidet Formnachbarn hintereinander). */
function newOrder(id: string): string {
  return createHash(id);
}

export function buildQueue(input: QueueInput): { entries: QueueEntry[]; summary: QueueSummary } {
  const { items, states, now, settings, planner, directions } = input;
  const today = dayStart(now);
  const learning: { e: QueueEntry; due: number }[] = [];
  const review: { e: QueueEntry; r: number }[] = [];
  const fresh: { e: QueueEntry; key: string }[] = [];
  let newToday = 0;
  for (const s of states.values()) if (new Date(s.introducedAt) >= today) newToday++;

  for (const item of items) {
    for (const direction of item.directions) {
      if (!directions.includes(direction)) continue;
      if (!isUnlocked(item, direction, states)) continue;
      const id = cardId(item.id, direction);
      const state = states.get(id);
      const e = { cardId: id, item, direction };
      if (!state) {
        if (!siblingSeenToday(item, direction, states, today)) fresh.push({ e, key: newOrder(id) });
        continue;
      }
      const due = new Date(state.fsrs.dueAt).getTime();
      if (due > now.getTime()) continue;
      if (state.status === 'review') {
        if (!siblingSeenToday(item, direction, states, today)) review.push({ e, r: planner.retrievability(state, now) });
      } else {
        learning.push({ e, due });
      }
    }
  }

  learning.sort((a, b) => a.due - b.due);
  review.sort((a, b) => a.r - b.r);
  fresh.sort((a, b) => (a.key < b.key ? -1 : 1));
  const newLimit = Math.max(0, settings.newPerDay - newToday);
  const entries = [...learning.map((x) => x.e), ...review.map((x) => x.e), ...fresh.slice(0, newLimit).map((x) => x.e)].slice(
    0,
    settings.sessionSize,
  );
  return {
    entries,
    summary: { due: learning.length + review.length, newAvailable: Math.min(fresh.length, newLimit), newToday },
  };
}

interface Snapshot {
  pending: QueueEntry[];
  learning: { entry: QueueEntry; due: number }[];
  current: QueueEntry | null;
  done: number;
}

/** Ablauf einer Sitzung: Hauptschlange plus Lernschritte, die während der Sitzung wieder fällig werden. */
export class Session {
  private pending: QueueEntry[];
  private learning: { entry: QueueEntry; due: number }[] = [];
  private history: { snapshot: Snapshot; cardId: string; prev: CardState | null; eventId: string }[] = [];
  current: QueueEntry | null = null;
  done = 0;

  constructor(
    entries: QueueEntry[],
    private readonly states: Map<string, CardState>,
    private readonly planner: Planner,
    readonly id: string,
  ) {
    this.pending = [...entries];
  }

  get remaining(): number {
    return this.pending.length + this.learning.length + (this.current ? 1 : 0);
  }

  /** Nächste Karte: fällige Lernschritte zuerst, dann die Hauptschlange, zuletzt Lernschritte vorgezogen. */
  next(now: Date): QueueEntry | null {
    this.learning.sort((a, b) => a.due - b.due);
    const dueLearning = this.learning[0] && this.learning[0].due <= now.getTime();
    if (dueLearning) this.current = this.learning.shift()!.entry;
    else if (this.pending.length > 0) this.current = this.pending.shift()!;
    else this.current = this.learning.shift()?.entry ?? null;
    return this.current;
  }

  stateOf(entry: QueueEntry): CardState | null {
    return this.states.get(entry.cardId) ?? null;
  }

  answer(args: { grade: Grade; now: Date; shownAt: Date; revealedAt: Date | null; appVersion: string }): {
    state: CardState;
    event: ReviewEvent;
  } {
    const entry = this.current;
    if (!entry) throw new Error('Keine aktuelle Karte');
    const snapshot: Snapshot = {
      pending: [...this.pending],
      learning: [...this.learning],
      current: entry,
      done: this.done,
    };
    const prev = this.stateOf(entry);
    const result = this.planner.rate({
      state: prev,
      cardId: entry.cardId,
      itemId: entry.item.id,
      direction: entry.direction,
      sessionId: this.id,
      ...args,
    });
    this.states.set(entry.cardId, result.state);
    this.history.push({ snapshot, cardId: entry.cardId, prev, eventId: result.event.id });
    const due = new Date(result.state.fsrs.dueAt).getTime();
    if (due <= args.now.getTime() + LEARN_AHEAD_MIN * 60_000) this.learning.push({ entry, due });
    this.done++;
    this.current = null;
    return result;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Letzte Bewertung zurücknehmen. Liefert den vorherigen Zustand (null = Karte war neu). */
  undo(): { cardId: string; prev: CardState | null; eventId: string } | null {
    const h = this.history.pop();
    if (!h) return null;
    this.pending = h.snapshot.pending;
    this.learning = h.snapshot.learning;
    this.current = h.snapshot.current;
    this.done = h.snapshot.done;
    if (h.prev) this.states.set(h.cardId, h.prev);
    else this.states.delete(h.cardId);
    return { cardId: h.cardId, prev: h.prev, eventId: h.eventId };
  }
}
