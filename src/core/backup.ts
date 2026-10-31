// Sicherung des Lernstands als Datei (Version 1 hat keinen Sync) und Meldungen an die CSV-Pflege.

import type { CardState, GameMode, LogEvent, Settings } from './state.ts';
import type { Item } from './types.ts';

export const BACKUP_FORMAT = 'tous-mes-mots-backup';
export const BACKUP_VERSION = 1;
export const REPORTS_FORMAT = 'tous-mes-mots-meldungen';

export type ReportReason = 'bedeutung' | 'unvollstaendig' | 'schreibung' | 'sonstiges';
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'bedeutung', label: 'Bedeutung falsch' },
  { value: 'unvollstaendig', label: 'Unvollständig' },
  { value: 'schreibung', label: 'Schreibung' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

/** Meldung zu einem Eintrag; enthält Lemma und Richtung, weil die Chat-Sitzung die Zeile darüber findet. */
export interface Report {
  id: string;
  ts: string;
  itemId: string;
  fr: string;
  de: string;
  richtung: Item['richtung'];
  /** Zeilennummer beim letzten Import (nur Orientierung, kann sich verschieben). */
  line: number;
  sicherheit: Item['sicherheit'];
  reason: ReportReason;
  note: string;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appVersion: string;
  settings: Settings;
  bests: Partial<Record<GameMode, number>>;
  cards: CardState[];
  events: LogEvent[];
  reports: Report[];
}

export function buildBackup(input: Omit<Backup, 'format' | 'version' | 'exportedAt'>, now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...input };
}

/** Prüft eine eingelesene Datei; wirft mit verständlicher Meldung, statt halbe Daten zu übernehmen. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  const b = data as Partial<Backup>;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('Das ist keine Sicherung von Tous mes mots.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  if (!Array.isArray(b.cards) || !Array.isArray(b.events)) throw new Error('Die Sicherung ist unvollständig.');
  for (const c of b.cards) if (!c || typeof c.cardId !== 'string' || typeof c.itemId !== 'string') throw new Error('Die Sicherung enthält fehlerhafte Karten.');
  for (const e of b.events) if (!e || typeof e.id !== 'string' || typeof e.ts !== 'string') throw new Error('Die Sicherung enthält fehlerhafte Ereignisse.');
  return { reports: [], bests: {}, ...b } as Backup;
}

/** Zeitpunkt der letzten Antwort auf einer Karte; entscheidet beim Zusammenführen. */
export function lastActivity(c: CardState): string {
  return (c.status === 'retired' ? c.audit?.lastAt : c.fsrs?.lastReviewAt) ?? c.introducedAt ?? '';
}

export interface MergePlan {
  /** Karten, deren Stand in der Datei neuer ist (oder die es hier noch nicht gibt). */
  cards: CardState[];
  /** Ereignisse, die hier noch fehlen (das Protokoll wird nur ergänzt). */
  events: LogEvent[];
  reports: Report[];
  bests: Partial<Record<GameMode, number>>;
  /** Karten, bei denen der Stand hier neuer ist und bleibt. */
  keptLocal: number;
}

/**
 * Zusammenführen statt Überschreiben: Ereignisse werden vereinigt (gleiche ID = gleiches Ereignis),
 * bei Karten gewinnt der Stand mit der jüngsten Antwort, Bestwerte das Maximum.
 * So kann man auch Sicherungen von zwei Geräten nacheinander einlesen.
 */
export function planMerge(
  local: { cards: CardState[]; eventIds: Set<string>; reportIds: Set<string>; bests: Partial<Record<GameMode, number>> },
  incoming: Backup,
): MergePlan {
  const localCards = new Map(local.cards.map((c) => [c.cardId, c]));
  const cards: CardState[] = [];
  let keptLocal = 0;
  for (const c of incoming.cards) {
    const mine = localCards.get(c.cardId);
    if (!mine || lastActivity(c) > lastActivity(mine)) cards.push(c);
    else if (lastActivity(c) < lastActivity(mine)) keptLocal++;
  }
  const bests: Partial<Record<GameMode, number>> = {};
  for (const [mode, v] of Object.entries(incoming.bests ?? {}) as [GameMode, number][]) {
    if (v > (local.bests[mode] ?? 0)) bests[mode] = v;
  }
  return {
    cards,
    events: incoming.events.filter((e) => !local.eventIds.has(e.id)),
    reports: (incoming.reports ?? []).filter((r) => !local.reportIds.has(r.id)),
    bests,
    keptLocal,
  };
}

/** Meldungen als Datei für die Chat-Sitzung (der einzige Rückkanal zur CSV-Pflege, Briefing 5). */
export function reportsFile(reports: Report[], now = new Date()) {
  return {
    format: REPORTS_FORMAT,
    exportedAt: now.toISOString(),
    hinweis: 'Zeile finden über Französisch + Richtung; „line“ ist die Zeilennummer beim letzten Import.',
    meldungen: reports.map((r) => ({
      französisch: r.fr,
      richtung: r.richtung,
      deutsch: r.de,
      sicherheit: r.sicherheit,
      grund: REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason,
      notiz: r.note,
      gemeldetAm: r.ts,
      line: r.line,
      id: r.itemId,
    })),
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s;
};

/** Protokoll als CSV (Semikolon, UTF-8 mit BOM) zur Auswertung in Tabellenkalkulation, R oder Python. */
export function eventsCsv(events: LogEvent[], items: Map<string, Item>): string {
  const head = ['ts', 'kind', 'mode', 'format', 'direction', 'itemId', 'fr', 'rating_or_correct', 'answerMs', 'revealMs', 'rPred', 'stabilityBefore', 'stabilityAfter', 'game', 'typed', 'sessionId', 'id', 'undoTarget'];
  const rows = events.map((e) => {
    const fr = 'itemId' in e ? items.get(e.itemId)?.fr ?? '' : '';
    if (e.kind === 'review') {
      return [e.ts, e.kind, e.mode, e.format, e.direction, e.itemId, fr, e.rating, e.answerMs, e.revealMs, e.rPred, e.before.stability, e.after.stability, '', e.typed?.answer ?? '', e.sessionId, e.id, ''];
    }
    if (e.kind === 'game') {
      return [e.ts, e.kind, '', '', 'fr-de', e.itemId, fr, e.correct ? 1 : 0, e.latencyMs, '', '', '', '', e.game, '', e.sessionId, e.id, ''];
    }
    return [e.ts, e.kind, '', '', '', '', '', '', '', '', '', '', '', '', '', '', e.id, e.targetId];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
