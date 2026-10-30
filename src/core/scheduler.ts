// Dünne Hülle um ts-fsrs (FSRS-6, Standardparameter). Rechnet ausschließlich, speichert nichts.

import { DefaultScheduler, type DefaultSchedulerCard } from 'ts-fsrs';
import type { CardState, CardStatus, FsrsSnapshot, Grade, MemorySnapshot, ReviewEvent, Settings } from './state.ts';
import { newId } from './state.ts';
import type { Direction } from './types.ts';

export const SCHEDULER_ID = 'ts-fsrs@6.0.0 FSRS-6';

type FsrsCard = DefaultSchedulerCard<'FSRS-6'>;

export interface Planner {
  desiredRetention: number;
  /** Voraussichtliche Fälligkeit je Bewertung, für die Beschriftung der Knöpfe. */
  preview(state: CardState | null, now: Date): Record<Grade, Date>;
  rate(input: RateInput): { state: CardState; event: ReviewEvent };
  retrievability(state: CardState, now: Date): number;
}

export interface RateInput {
  state: CardState | null;
  cardId: string;
  itemId: string;
  direction: Direction;
  grade: Grade;
  now: Date;
  shownAt: Date;
  revealedAt: Date | null;
  sessionId: string;
  appVersion: string;
}

function toSnapshot(card: FsrsCard): FsrsSnapshot {
  return JSON.parse(JSON.stringify(card)) as FsrsSnapshot;
}

function revive(s: FsrsSnapshot): FsrsCard {
  return { ...s, dueAt: new Date(s.dueAt), lastReviewAt: s.lastReviewAt ? new Date(s.lastReviewAt) : null } as unknown as FsrsCard;
}

function statusOf(card: FsrsSnapshot): CardStatus {
  const s = card.scheduleStatus;
  return s === 'review' || s === 'relearning' ? s : 'learning';
}

function memory(state: CardState | null): MemorySnapshot {
  if (!state) return { status: 'new', stability: 0, difficulty: 0, dueAt: null };
  return { status: state.status, stability: state.fsrs.stability, difficulty: state.fsrs.difficulty, dueAt: state.fsrs.dueAt };
}

export async function createPlanner(settings: Pick<Settings, 'desiredRetention'>): Promise<Planner> {
  const scheduler = await DefaultScheduler({
    version: 'FSRS-6',
    desiredRetention: settings.desiredRetention,
    enableFuzz: true,
  });

  const cardFor = (state: CardState | null, now: Date): FsrsCard =>
    state ? revive(state.fsrs) : (scheduler.newCard({ now }) as FsrsCard);

  const elapsed = (state: CardState, now: Date): number | null => {
    const last = state.fsrs.lastReviewAt;
    return last ? scheduler.chrono.difference(new Date(last), now) : null;
  };

  const retrievability = (state: CardState, now: Date): number => {
    const days = elapsed(state, now);
    return days === null ? 0 : scheduler.model.forgettingCurve(revive(state.fsrs) as never, days);
  };

  return {
    desiredRetention: settings.desiredRetention,

    preview(state, now) {
      const out = {} as Record<Grade, Date>;
      for (const p of scheduler.preview({ card: cardFor(state, now), now })) {
        out[p.grade as Grade] = (p.card as FsrsCard).dueAt as Date;
      }
      return out;
    },

    retrievability,

    rate({ state, cardId, itemId, direction, grade, now, shownAt, revealedAt, sessionId, appVersion }) {
      const result = scheduler.review({ card: cardFor(state, now), grade, now });
      const fsrs = toSnapshot(result.card as FsrsCard);
      const next: CardState = {
        cardId,
        itemId,
        direction,
        status: statusOf(fsrs),
        fsrs,
        introducedAt: state?.introducedAt ?? now.toISOString(),
      };
      const event: ReviewEvent = {
        kind: 'review',
        id: newId(),
        ts: now.toISOString(),
        sessionId,
        cardId,
        itemId,
        direction,
        format: 'flip',
        mode: 'review',
        rating: grade,
        shownAt: shownAt.toISOString(),
        revealMs: revealedAt ? revealedAt.getTime() - shownAt.getTime() : null,
        answerMs: now.getTime() - shownAt.getTime(),
        before: memory(state),
        after: { ...memory(next), scheduledDays: fsrs.scheduledDays },
        rPred: state ? retrievability(state, now) : null,
        elapsedDays: state ? elapsed(state, now) : null,
        scheduler: SCHEDULER_ID,
        desiredRetention: settings.desiredRetention,
        appVersion,
      };
      return { state: next, event };
    },
  };
}

/** „1 Min“, „10 Min“, „3 T“, „2 Mon“, „1,5 J“ */
export function formatInterval(from: Date, to: Date): string {
  const min = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (min < 60) return `${min} Min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} Std`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} T`;
  if (d < 365) return `${Math.round(d / 30)} Mon`;
  return `${(d / 365).toFixed(1).replace('.', ',').replace(',0', '')} J`;
}
