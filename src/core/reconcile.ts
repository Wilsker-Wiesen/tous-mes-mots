// Abgleich von gespeichertem Lernzustand mit einem neuen Importstand.

import type { CardState } from './state.ts';
import type { CardsFile } from './types.ts';

/**
 * Zustände, deren Zeile weder im Import noch in der Waisenliste steht, werden gelöscht.
 * Waisen behalten ihren Zustand, bis der Import sie nach 90 Tagen streicht.
 */
export function statesToDelete(states: Iterable<CardState>, file: Pick<CardsFile, 'items' | 'orphans'>): string[] {
  const keep = new Set([...file.items.map((i) => i.id), ...file.orphans.map((o) => o.id)]);
  const out: string[] = [];
  for (const s of states) if (!keep.has(s.itemId)) out.push(s.cardId);
  return out;
}

/** Zustände, die im aktuellen Import aktiv sind (Waisen ausgenommen). */
export function activeStates(states: Iterable<CardState>, file: Pick<CardsFile, 'items'>): Map<string, CardState> {
  const ids = new Set(file.items.map((i) => i.id));
  const out = new Map<string, CardState>();
  for (const s of states) if (ids.has(s.itemId)) out.set(s.cardId, s);
  return out;
}
