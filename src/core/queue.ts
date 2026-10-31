// Auswahl der Karten für eine Sitzung und Ablauf innerhalb der Sitzung (rein, ohne Speicher).

import { createHash } from './hash.ts';
import type { Planner } from './scheduler.ts';
import type { CardState, ReviewEvent, Settings } from './state.ts';
import { dayStart } from './state.ts';
import { cardId, type Direction, type Item } from './types.ts';

/** Die zweite Richtung einer Zeile wird erst freigeschaltet, wenn die Startkarte so stabil ist (Tage) oder aussortiert. */
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
  directions: Direction[];
}

export interface QueueSummary {
  /** Fällige Lern- und Wiederholkarten plus heutige Stichproben. */
  due: number;
  /** Noch nie gesehene Karten. */
  unsorted: number;
  /** Aussortierte (beim ersten Sehen gewusste) Karten. */
  retired: number;
  /** Heute neu begonnene Karten, die man nicht wusste. */
  newToday: number;
}

export interface Queue {
  /** Fällige Karten in Reihenfolge. */
  due: QueueEntry[];
  /** Alle ungesehenen Karten in stabiler, gestreuter Reihenfolge. */
  fresh: QueueEntry[];
  /** Wie viele neue Karten heute noch als „nicht gewusst“ in den Lernstapel dürfen. */
  newBudget: number;
  summary: QueueSummary;
}

function lastSeen(s: CardState | undefined): string | null | undefined {
  if (!s) return null;
  return s.status === 'retired' ? s.audit?.lastAt : s.fsrs.lastReviewAt;
}

function isUnlocked(item: Item, direction: Direction, states: Map<string, CardState>): boolean {
  const primary = item.directions[0];
  if (direction === primary) return true;
  if (!item.directions.includes(direction) || !primary) return false;
  const p = states.get(cardId(item.id, primary));
  return !!p && (p.status === 'retired' || p.fsrs.stability > UNLOCK_STABILITY_DAYS);
}

/** Geschwisterkarte heute schon gesehen? Dann wartet diese Karte bis morgen. */
function siblingSeenToday(item: Item, direction: Direction, states: Map<string, CardState>, today: Date): boolean {
  return item.directions.some((d) => {
    if (d === direction) return false;
    const last = lastSeen(states.get(cardId(item.id, d)));
    return !!last && new Date(last) >= today;
  });
}

export function buildQueue(input: QueueInput): Queue {
  const { items, states, now, settings, planner, directions } = input;
  const today = dayStart(now);
  const t = now.getTime();
  const learning: { e: QueueEntry; due: number }[] = [];
  const review: { e: QueueEntry; r: number }[] = [];
  const audits: { e: QueueEntry; due: number }[] = [];
  const fresh: { e: QueueEntry; key: string }[] = [];
  let newToday = 0;
  let retired = 0;
  for (const s of states.values()) {
    if (s.status === 'retired') retired++;
    else if (new Date(s.introducedAt) >= today) newToday++;
  }

  for (const item of items) {
    for (const direction of item.directions) {
      if (!directions.includes(direction) || !isUnlocked(item, direction, states)) continue;
      const id = cardId(item.id, direction);
      const state = states.get(id);
      const e = { cardId: id, item, direction };
      const waits = siblingSeenToday(item, direction, states, today);
      if (!state) {
        if (!waits) fresh.push({ e, key: createHash(id) });
      } else if (state.status === 'retired') {
        const due = new Date(state.audit?.dueAt ?? 0).getTime();
        if (due <= t && !waits) audits.push({ e, due });
      } else {
        const due = new Date(state.fsrs.dueAt).getTime();
        if (due > t) continue;
        if (state.status === 'review') {
          if (!waits) review.push({ e, r: planner.retrievability(state, now) });
        } else {
          learning.push({ e, due });
        }
      }
    }
  }

  learning.sort((a, b) => a.due - b.due);
  review.sort((a, b) => a.r - b.r);
  audits.sort((a, b) => a.due - b.due);
  fresh.sort((a, b) => (a.key < b.key ? -1 : 1));
  const due = [...learning.map((x) => x.e), ...review.map((x) => x.e), ...audits.slice(0, settings.auditsPerDay).map((x) => x.e)];
  return {
    due,
    fresh: fresh.map((x) => x.e),
    newBudget: Math.max(0, settings.newPerDay - newToday),
    summary: { due: due.length, unsorted: fresh.length, retired, newToday },
  };
}

interface Snapshot {
  pending: QueueEntry[];
  fresh: QueueEntry[];
  learning: { entry: QueueEntry; due: number }[];
  current: QueueEntry | null;
  done: number;
  taken: number;
  budget: number;
}

/**
 * Ablauf einer Sitzung: fällige Karten, dann neue. Neue Karten, die man wusste, werden aussortiert und kosten
 * kein Tagesbudget; nur nicht gewusste zählen. Nicht gewusste kommen nach kurzer Zeit in derselben Sitzung wieder.
 */
export class Session {
  private pending: QueueEntry[];
  private fresh: QueueEntry[];
  private learning: { entry: QueueEntry; due: number }[] = [];
  private history: { snapshot: Snapshot; cardId: string; prev: CardState | null; eventId: string }[] = [];
  private budget: number;
  /** Aus Hauptschlange oder Neuvorrat entnommene Karten (Wiederholungen zählen nicht). */
  private taken = 0;
  current: QueueEntry | null = null;
  done = 0;

  constructor(
    queue: Pick<Queue, 'due' | 'fresh' | 'newBudget'>,
    private readonly states: Map<string, CardState>,
    private readonly planner: Planner,
    private readonly size: number,
    readonly id: string,
  ) {
    this.pending = [...queue.due];
    this.fresh = [...queue.fresh];
    this.budget = queue.newBudget;
  }

  private freshLeft(): number {
    return Math.max(0, Math.min(this.fresh.length, this.size - this.taken - this.pending.length, this.budget > 0 ? Infinity : 0));
  }

  get remaining(): number {
    return Math.min(this.size - this.taken, this.pending.length + this.freshLeft()) + this.learning.length + (this.current ? 1 : 0);
  }

  /** Nächste Karte: fällige Lernschritte, dann fällige Karten, dann neue, zuletzt Lernschritte vorgezogen. */
  next(now: Date): QueueEntry | null {
    this.learning.sort((a, b) => a.due - b.due);
    const room = this.taken < this.size;
    if (this.learning[0] && this.learning[0].due <= now.getTime()) this.current = this.learning.shift()!.entry;
    else if (room && this.pending.length > 0) (this.current = this.pending.shift()!), this.taken++;
    else if (room && this.budget > 0 && this.fresh.length > 0) (this.current = this.fresh.shift()!), this.taken++;
    else this.current = this.learning.shift()?.entry ?? null;
    return this.current;
  }

  stateOf(entry: QueueEntry): CardState | null {
    return this.states.get(entry.cardId) ?? null;
  }

  answer(args: {
    known: boolean;
    now: Date;
    shownAt: Date;
    revealedAt: Date | null;
    appVersion: string;
    typed?: { answer: string; match: boolean };
  }): {
    state: CardState;
    event: ReviewEvent;
  } {
    const entry = this.current;
    if (!entry) throw new Error('Keine aktuelle Karte');
    const snapshot: Snapshot = {
      pending: [...this.pending],
      fresh: [...this.fresh],
      learning: [...this.learning],
      current: entry,
      done: this.done,
      taken: this.taken,
      budget: this.budget,
    };
    const prev = this.stateOf(entry);
    const result = this.planner.answer({
      state: prev,
      cardId: entry.cardId,
      itemId: entry.item.id,
      direction: entry.direction,
      sessionId: this.id,
      ...args,
    });
    this.states.set(entry.cardId, result.state);
    this.history.push({ snapshot, cardId: entry.cardId, prev, eventId: result.event.id });
    if (!prev && !args.known) this.budget--;
    if (result.state.status !== 'retired') {
      const due = new Date(result.state.fsrs.dueAt).getTime();
      if (due <= args.now.getTime() + LEARN_AHEAD_MIN * 60_000) this.learning.push({ entry, due });
    }
    this.done++;
    this.current = null;
    return result;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Letzte Antwort zurücknehmen. Liefert den vorherigen Zustand (null = Karte war neu). */
  undo(): { cardId: string; prev: CardState | null; eventId: string } | null {
    const h = this.history.pop();
    if (!h) return null;
    Object.assign(this, h.snapshot);
    if (h.prev) this.states.set(h.cardId, h.prev);
    else this.states.delete(h.cardId);
    return { cardId: h.cardId, prev: h.prev, eventId: h.eventId };
  }
}
