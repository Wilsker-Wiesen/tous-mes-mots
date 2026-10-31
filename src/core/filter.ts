// Auswahl der abgefragten Einträge vor einer Sitzung (Briefing 4: Filter beim Start).

import { normalizeAnswer } from './normalize.ts';
import type { Settings } from './state.ts';
import type { Item } from './types.ts';

export interface ItemFilter extends Pick<Settings, 'hideUncertain' | 'onlyExpressions'> {
  /** Lemmasuche in Französisch und Deutsch, Akzente und Klammern egal. */
  search?: string;
}

/** Suchform: wie normalizeAnswer, aber Klammerinhalte bleiben (man sucht auch nach „Wäsche“). */
function searchKey(s: string): string {
  return normalizeAnswer(s.replace(/[()]/gu, ' '));
}

export function filterItems(items: Item[], f: ItemFilter): Item[] {
  const q = f.search ? searchKey(f.search) : '';
  return items.filter(
    (i) =>
      (!f.hideUncertain || i.sicherheit !== 'eigen?') &&
      (!f.onlyExpressions || i.expression) &&
      (!q || searchKey(i.fr).includes(q) || searchKey(i.de).includes(q)),
  );
}
