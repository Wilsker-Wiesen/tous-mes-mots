// Spiele: Multiple Choice gegen die Uhr. Kein Einfluss auf die Lernplanung, außer einem Prüfsignal:
// Ein Fehler bei einem aussortierten oder gefestigten Wort zieht dessen nächste Abfrage auf morgen vor.

import { meaningLines } from './display.ts';
import { normalizeAnswer } from './normalize.ts';
import type { CardState, GameEvent } from './state.ts';
export type { GameEvent, GameMode } from './state.ts';
import { dayStart, newId } from './state.ts';
import { cardId, type Item } from './types.ts';

export const SPRINT_SECONDS = 60;
export const SUDDEN_SECONDS_PER_WORD = 5;
export const OPTIONS = 4;
/** Ab dieser Stabilität (Tage) gilt eine Lernkarte als gefestigt. */
export const MATURE_DAYS = 21;

export interface Round {
  target: Item;
  options: { item: Item; text: string }[];
}

/** Grobe Wortklasse aus den Klammerzusätzen der CSV, damit Ablenker nichts verraten. */
export function wordClass(item: Item): string {
  const fr = item.fr;
  if (item.expression) return 'wendung';
  if (/\((?:m|m\.|m pl\.?|m\/f)\)/u.test(fr)) return 'nm';
  if (/\((?:f|f\.|f pl\.?)\)/u.test(fr)) return 'nf';
  if (/\(adj\.?\)|, -\p{L}+/u.test(fr)) return 'adj';
  if (/\(v\.?\)/u.test(fr) || /^(?:se |s')?\p{L}+(?:er|ir|re)$/u.test(fr.trim())) return 'verb';
  return fr.trim().includes(' ') ? 'wendung' : 'sonst';
}

/** Erste Bedeutung als Antworttext, z. B. „Ausschnitt“. */
export function optionText(item: Item): string {
  return meaningLines(item.de)[0]?.text ?? item.de;
}

function meaningSet(item: Item): Set<string> {
  return new Set(meaningLines(item.de).map((l) => normalizeAnswer(l.text)).filter(Boolean));
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Drei Ablenker: bevorzugt gleiche Wortklasse und ähnliche Länge; nie ein Wort, das eine Bedeutung mit dem
 * Ziel teilt (sonst wäre eine „falsche“ Antwort richtig), und keine doppelten Antworttexte.
 */
export function buildRound(target: Item, pool: Item[], rng: () => number = Math.random): Round {
  const targetMeanings = meaningSet(target);
  const targetText = normalizeAnswer(optionText(target));
  const cls = wordClass(target);
  const len = optionText(target).length;
  const seen = new Set([targetText]);
  const candidates = shuffle(pool, rng).filter((c) => {
    if (c.id === target.id) return false;
    const text = normalizeAnswer(optionText(c));
    if (!text || seen.has(text)) return false;
    for (const m of meaningSet(c)) if (targetMeanings.has(m)) return false;
    return true;
  });
  const score = (c: Item) => (wordClass(c) === cls ? 0 : 10) + Math.min(9, Math.abs(optionText(c).length - len) / 4);
  const picked: Item[] = [];
  for (const c of [...candidates].sort((a, b) => score(a) - score(b))) {
    const text = normalizeAnswer(optionText(c));
    if (seen.has(text)) continue;
    seen.add(text);
    picked.push(c);
    if (picked.length === OPTIONS - 1) break;
  }
  const options = shuffle([target, ...picked], rng).map((item) => ({ item, text: optionText(item) }));
  return { target, options };
}

/** Wortauswahl: bevorzugt schon gesehene Wörter; solange es zu wenige gibt, alle. */
export function gamePool(items: Item[], states: Map<string, CardState>, minSeen = 30): Item[] {
  const seen = items.filter((i) => states.has(cardId(i.id, 'fr-de')));
  return seen.length >= minSeen ? seen : items.filter((i) => i.directions.includes('fr-de'));
}

/** Prüfsignal nach einem Fehler: aussortierte oder gefestigte Karte spätestens morgen wieder abfragen. */
export function pullForward(state: CardState | undefined, now: Date): CardState | null {
  if (!state) return null;
  const tomorrow = dayStart(new Date(now.getTime() + 86_400_000)).toISOString();
  if (state.status === 'retired' && state.audit && state.audit.dueAt > tomorrow) {
    return { ...state, audit: { ...state.audit, dueAt: tomorrow } };
  }
  if (state.status === 'review' && state.fsrs.stability >= MATURE_DAYS && state.fsrs.dueAt > tomorrow) {
    return { ...state, fsrs: { ...state.fsrs, dueAt: tomorrow } };
  }
  return null;
}

export function gameEvent(fields: Omit<GameEvent, 'kind' | 'id'>): GameEvent {
  return { kind: 'game', id: newId(), ...fields };
}
