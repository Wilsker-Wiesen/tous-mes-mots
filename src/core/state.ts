// Lernzustand und Ereignisprotokoll. Der Kartenzustand ist ein Cache; maßgeblich ist das Protokoll,
// aus dem er sich (z. B. für einen späteren Wechsel zu FSRS-7) neu berechnen lässt.

import type { Direction } from './types.ts';

/** retired = beim ersten Sehen gewusst, kommt nur noch als seltene Stichprobe. */
export type CardStatus = 'learning' | 'review' | 'relearning' | 'retired';
/** FSRS-Note im Protokoll: 1 = nicht gewusst (Again), 3 = gewusst (Good). */
export type Grade = 1 | 3;
/** triage = erstes Sehen, audit = Stichprobe eines aussortierten Worts, review = normales Lernen. */
export type AnswerMode = 'triage' | 'audit' | 'review';

/** ts-fsrs-Karte in JSON-tauglicher Form (Datumsfelder als ISO-Text). */
export type FsrsSnapshot = Record<string, unknown> & {
  stability: number;
  difficulty: number;
  dueAt: string;
  lastReviewAt: string | null;
  scheduleStatus: string;
  scheduledDays: number;
  reps: number;
  lapses: number;
};

/** Nur Karten mit mindestens einer Bewertung haben einen Zustand; alle anderen gelten als neu. */
export interface CardState {
  cardId: string;
  itemId: string;
  direction: Direction;
  status: CardStatus;
  fsrs: FsrsSnapshot;
  introducedAt: string;
  /** Nur bei status = retired: nächste Stichprobe. */
  audit?: { dueAt: string; intervalDays: number; lastAt: string };
}

export interface MemorySnapshot {
  status: CardStatus | 'new';
  stability: number;
  difficulty: number;
  dueAt: string | null;
}

export interface ReviewEvent {
  kind: 'review';
  id: string;
  /** Zeitpunkt der Bewertung (ISO). */
  ts: string;
  sessionId: string;
  cardId: string;
  itemId: string;
  direction: Direction;
  /** flip = umdrehen und selbst einschätzen; typed = vorher eingetippt; voice = Hörmodus, gesprochen. */
  format: 'flip' | 'typed' | 'voice';
  /** Bei typed und voice: Eingabe (bzw. erkannter Text) und Ergebnis des Vergleichs. */
  typed?: { answer: string; match: boolean };
  mode: AnswerMode;
  rating: Grade;
  shownAt: string;
  /** Zeit bis zum Aufdecken: Maß für die Abrufdauer. */
  revealMs: number | null;
  /** Zeit vom Zeigen bis zur Bewertung. */
  answerMs: number;
  before: MemorySnapshot;
  after: MemorySnapshot & { scheduledDays: number };
  /** Vorhergesagte Abrufwahrscheinlichkeit vor der Bewertung (null bei neuen Karten). */
  rPred: number | null;
  elapsedDays: number | null;
  scheduler: string;
  desiredRetention: number;
  appVersion: string;
}

/** Macht eine Bewertung rückgängig, ohne das Protokoll zu verändern. */
export interface UndoEvent {
  kind: 'undo';
  id: string;
  ts: string;
  targetId: string;
}

export type GameMode = 'sprint' | 'sudden';

/** Spielzug: wird protokolliert, ändert aber keine Planung (außer dem Prüfsignal, siehe game.ts). */
export interface GameEvent {
  kind: 'game';
  id: string;
  ts: string;
  sessionId: string;
  game: GameMode;
  cardId: string;
  itemId: string;
  correct: boolean;
  /** null = Zeit abgelaufen. */
  chosenItemId: string | null;
  optionItemIds: string[];
  latencyMs: number;
}

export type LogEvent = ReviewEvent | UndoEvent | GameEvent;

export interface Settings {
  /** Höchstzahl neuer Wörter pro Tag, die man NICHT wusste (gewusste kosten nichts). */
  newPerDay: number;
  /** Karten pro Sitzung (ohne Wiederholungen innerhalb der Sitzung). */
  sessionSize: number;
  /** Stichproben aussortierter Wörter pro Tag. */
  auditsPerDay: number;
  desiredRetention: number;
  /** Abgefragte Richtungen. */
  directions: Direction[];
  /** Deutsch → Französisch: Antwort vor dem Umdrehen eintippen. */
  typing: boolean;
  /** Einträge mit Sicherheit „eigen?“ ausblenden. */
  hideUncertain: boolean;
  /** Nur Wendungen (Expressions). */
  onlyExpressions: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  sessionSize: 50,
  auditsPerDay: 5,
  desiredRetention: 0.9,
  directions: ['fr-de'],
  typing: false,
  hideUncertain: false,
  onlyExpressions: false,
};

/** Lerntag beginnt um 4 Uhr Ortszeit, damit späte Abendsitzungen zum selben Tag zählen. */
export const DAY_ROLLOVER_HOUR = 4;

export function dayStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_ROLLOVER_HOUR);
  if (now < d) d.setDate(d.getDate() - 1);
  return d;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
