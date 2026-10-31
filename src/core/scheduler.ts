// Planung: FSRS-6 über ts-fsrs für alles, was gelernt wird, dazu „aussortiert“ für Wörter,
// die beim ersten Sehen schon sitzen. Rechnet ausschließlich, speichert nichts.

import { DefaultScheduler, type DefaultSchedulerCard } from 'ts-fsrs';
import type { AnswerMode, CardState, CardStatus, FsrsSnapshot, MemorySnapshot, ReviewEvent, Settings } from './state.ts';
import { newId } from './state.ts';
import type { Direction } from './types.ts';

export const SCHEDULER_ID = 'ts-fsrs@6.0.0 FSRS-6';

/** Erste Stichprobe für ein aussortiertes Wort: zufällig in diesem Bereich (Tage), damit nicht alles gleichzeitig kommt. */
export const RETIRE_MIN_DAYS = 90;
export const RETIRE_MAX_DAYS = 365;
/** Bestandene Stichprobe verlängert den Abstand um diesen Faktor. */
export const AUDIT_GROWTH = 2.5;
const AUDIT_MAX_DAYS = 3650;

/** FSRS-Noten: nur „Nochmal“ und „Gut“, siehe DECISIONS.md. */
const AGAIN = 1;
const GOOD = 3;

type FsrsCard = DefaultSchedulerCard<'FSRS-6'>;

export interface AnswerInput {
  state: CardState | null;
  cardId: string;
  itemId: string;
  direction: Direction;
  known: boolean;
  now: Date;
  shownAt: Date;
  revealedAt: Date | null;
  sessionId: string;
  appVersion: string;
}

/** Was nach der jeweiligen Antwort passiert, für die Beschriftung der Knöpfe. */
export interface AnswerPreview {
  unknown: Date;
  /** Bei neuen Karten ein Bereich (aussortieren), sonst ein Zeitpunkt. */
  known: Date | { from: Date; to: Date };
}

export interface Planner {
  desiredRetention: number;
  preview(state: CardState | null, now: Date): AnswerPreview;
  answer(input: AnswerInput): { state: CardState; event: ReviewEvent };
  retrievability(state: CardState, now: Date): number;
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
  if (state.status === 'retired') return { status: 'retired', stability: 0, difficulty: 0, dueAt: state.audit?.dueAt ?? null };
  return { status: state.status, stability: state.fsrs.stability, difficulty: state.fsrs.difficulty, dueAt: state.fsrs.dueAt };
}

const DAY = 86_400_000;
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

export async function createPlanner(
  settings: Pick<Settings, 'desiredRetention'>,
  rng: () => number = Math.random,
): Promise<Planner> {
  const scheduler = await DefaultScheduler({
    version: 'FSRS-6',
    desiredRetention: settings.desiredRetention,
    enableFuzz: true,
  });

  /** Aussortierte Karten werden beim Wiedereinstieg wie neue behandelt. */
  const fsrsCardFor = (state: CardState | null, now: Date): FsrsCard =>
    state && state.status !== 'retired' ? revive(state.fsrs) : (scheduler.newCard({ now }) as FsrsCard);

  const elapsed = (state: CardState, now: Date): number | null => {
    const last = state.status === 'retired' ? state.audit?.lastAt : state.fsrs.lastReviewAt;
    return last ? scheduler.chrono.difference(new Date(last), now) : null;
  };

  const retrievability = (state: CardState, now: Date): number => {
    if (state.status === 'retired') return 1;
    const days = elapsed(state, now);
    return days === null ? 0 : scheduler.model.forgettingCurve(revive(state.fsrs) as never, days);
  };

  const fsrsDue = (state: CardState | null, grade: number, now: Date): Date => {
    for (const p of scheduler.preview({ card: fsrsCardFor(state, now), now })) {
      if (p.grade === grade) return (p.card as FsrsCard).dueAt as Date;
    }
    throw new Error(`Keine Vorschau für Note ${grade}`);
  };

  return {
    desiredRetention: settings.desiredRetention,
    retrievability,

    preview(state, now) {
      const unknown = fsrsDue(state, AGAIN, now);
      if (!state) return { unknown, known: { from: addDays(now, RETIRE_MIN_DAYS), to: addDays(now, RETIRE_MAX_DAYS) } };
      if (state.status === 'retired') {
        const interval = Math.min(AUDIT_MAX_DAYS, (state.audit?.intervalDays ?? RETIRE_MIN_DAYS) * AUDIT_GROWTH);
        return { unknown, known: addDays(now, interval) };
      }
      return { unknown, known: fsrsDue(state, GOOD, now) };
    },

    answer(input) {
      const { state, cardId, itemId, direction, known, now, shownAt, revealedAt, sessionId, appVersion } = input;
      const mode: AnswerMode = !state ? 'triage' : state.status === 'retired' ? 'audit' : 'review';
      const base = { cardId, itemId, direction, introducedAt: state?.introducedAt ?? now.toISOString() };
      let next: CardState;

      if (known && mode !== 'review') {
        // Neu und gewusst → aussortieren; Stichprobe bestanden → Abstand wächst.
        const intervalDays =
          mode === 'triage'
            ? Math.round(RETIRE_MIN_DAYS + rng() * (RETIRE_MAX_DAYS - RETIRE_MIN_DAYS))
            : Math.round(Math.min(AUDIT_MAX_DAYS, (state!.audit?.intervalDays ?? RETIRE_MIN_DAYS) * AUDIT_GROWTH));
        next = {
          ...base,
          status: 'retired',
          fsrs: state?.fsrs ?? toSnapshot(scheduler.newCard({ now }) as FsrsCard),
          audit: { dueAt: addDays(now, intervalDays).toISOString(), intervalDays, lastAt: now.toISOString() },
        };
      } else {
        // Alles andere läuft über FSRS: nicht gewusst = Nochmal, gewusst = Gut.
        const result = scheduler.review({ card: fsrsCardFor(state, now), grade: known ? GOOD : AGAIN, now });
        const fsrs = toSnapshot(result.card as FsrsCard);
        next = { ...base, status: statusOf(fsrs), fsrs };
      }

      const after = memory(next);
      const event: ReviewEvent = {
        kind: 'review',
        id: newId(),
        ts: now.toISOString(),
        sessionId,
        cardId,
        itemId,
        direction,
        format: 'flip',
        mode,
        rating: known ? GOOD : AGAIN,
        shownAt: shownAt.toISOString(),
        revealMs: revealedAt ? revealedAt.getTime() - shownAt.getTime() : null,
        answerMs: now.getTime() - shownAt.getTime(),
        before: memory(state),
        after: { ...after, scheduledDays: next.status === 'retired' ? next.audit!.intervalDays : next.fsrs.scheduledDays },
        rPred: state && state.status !== 'retired' ? retrievability(state, now) : null,
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
