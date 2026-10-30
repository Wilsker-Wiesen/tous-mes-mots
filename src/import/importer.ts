// CSV → Items mit stabilen IDs. Läuft nur in Node (node:crypto).

import { createHash } from 'node:crypto';
import { normalizeKey } from '../core/normalize.ts';
import type { Direction, Item, Richtung, Sicherheit } from '../core/types.ts';
import { parseCsv } from './csv.ts';

export const EXPECTED_HEADER = ['Französisch', 'Deutsch', 'Richtung', 'Notiz', 'Quelle', 'Sicherheit'];
const RICHTUNGEN: readonly string[] = ['FR→DE', 'DE→FR'];
const SICHERHEITEN: readonly string[] = ['Vorlage', 'eigen', 'eigen?'];

export interface ParseResult {
  items: Item[];
  /** Schlüssel, die mehrfach vorkommen und deshalb Suffixe bekommen haben. */
  collisions: { key: string; ids: string[]; lines: number[] }[];
  warnings: string[];
}

export function baseId(fr: string, richtung: string): string {
  return createHash('sha1').update(`${normalizeKey(fr)}|${richtung}`, 'utf8').digest('hex').slice(0, 12);
}

export function directionsFor(richtung: Richtung, expression: boolean): Direction[] {
  if (expression) return ['fr-de'];
  return richtung === 'DE→FR' ? ['de-fr', 'fr-de'] : ['fr-de', 'de-fr'];
}

/** Liest die CSV. Strukturfehler (Kopfzeile, Spaltenzahl, leere Pflichtfelder) brechen ab. */
export function parseVocabulary(text: string): ParseResult {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header || header.join(';') !== EXPECTED_HEADER.join(';')) {
    throw new Error(`Unerwartete Kopfzeile: ${header?.join(';') ?? '(leer)'}`);
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: Item[] = [];
  const seen = new Map<string, number>();
  const byKey = new Map<string, { ids: string[]; lines: number[] }>();

  rows.forEach((cols, idx) => {
    const line = idx + 1;
    if (cols.length === 1 && cols[0] === '') return; // Leerzeile
    if (cols.length !== EXPECTED_HEADER.length) {
      errors.push(`Zeile ${line}: ${cols.length} statt ${EXPECTED_HEADER.length} Spalten`);
      return;
    }
    const [fr, de, richtung, notiz, , sicherheit] = cols.map((c) => c.trim()) as [string, string, string, string, string, string];
    if (!fr) errors.push(`Zeile ${line}: Französisch ist leer`);
    if (!RICHTUNGEN.includes(richtung)) errors.push(`Zeile ${line}: unbekannte Richtung „${richtung}“`);
    if (!fr || !RICHTUNGEN.includes(richtung)) return;
    if (!de) warnings.push(`Zeile ${line}: Deutsch ist leer (${fr})`);
    let s = sicherheit as Sicherheit;
    if (!SICHERHEITEN.includes(sicherheit)) {
      warnings.push(`Zeile ${line}: unbekannte Sicherheit „${sicherheit}“, behandelt als „eigen?“ (${fr})`);
      s = 'eigen?';
    }

    const key = `${normalizeKey(fr)}|${richtung}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const id = n === 1 ? baseId(fr, richtung) : `${baseId(fr, richtung)}-${n}`;
    const entry = byKey.get(key) ?? { ids: [], lines: [] };
    entry.ids.push(id);
    entry.lines.push(line);
    byKey.set(key, entry);

    const expression = /\bExpression\b/u.test(notiz);
    items.push({
      id,
      fr,
      de,
      richtung: richtung as Richtung,
      notiz,
      sicherheit: s,
      expression,
      directions: directionsFor(richtung as Richtung, expression),
      line,
    });
  });

  if (errors.length > 0) {
    throw new Error(`CSV fehlerhaft, Import abgebrochen:\n  ${errors.join('\n  ')}`);
  }
  const collisions = [...byKey.entries()]
    .filter(([, v]) => v.ids.length > 1)
    .map(([key, v]) => ({ key, ...v }));
  return { items, collisions, warnings };
}
