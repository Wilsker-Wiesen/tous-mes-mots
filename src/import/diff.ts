// Vergleich zweier Importstände: neu, geändert, entfernt, verwaist.

import { normalizeAnswer, normalizeKey } from '../core/normalize.ts';
import type { CardsFile, Item, Orphan } from '../core/types.ts';

/** Nach so vielen Tagen wird verwaister Lernzustand endgültig gelöscht. */
export const ORPHAN_TTL_DAYS = 90;

const COMPARED: (keyof Item)[] = ['fr', 'de', 'notiz', 'sicherheit', 'expression', 'directions'];

export interface ImportDiff {
  added: Item[];
  changed: { before: Item; after: Item; fields: (keyof Item)[] }[];
  removed: { item: Item; successor?: Item }[];
  /** Wieder aufgetauchte IDs: ihr Lernzustand gilt wieder. */
  restored: Orphan[];
  /** Alle aktuell geführten Waisen, einschließlich der neu entfernten. */
  orphans: Orphan[];
  /** Waisen älter als ORPHAN_TTL_DAYS: Lernzustand wird gelöscht. */
  expired: Orphan[];
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/** Vermutlicher Nachfolger eines entfernten Items, z. B. nach Korrektur des Lemmas. */
function findSuccessor(gone: Item, candidates: Item[]): Item | undefined {
  const de = normalizeKey(gone.de);
  const fr = normalizeAnswer(gone.fr);
  return (
    candidates.find((c) => c.richtung === gone.richtung && de !== '' && normalizeKey(c.de) === de) ??
    candidates.find((c) => normalizeAnswer(c.fr) === fr)
  );
}

export function diffImport(prev: CardsFile | null, next: Item[], today: string): ImportDiff {
  const prevItems = prev?.items ?? [];
  const prevById = new Map(prevItems.map((i) => [i.id, i]));
  const nextIds = new Set(next.map((i) => i.id));

  const added = next.filter((i) => !prevById.has(i.id));
  const changed: ImportDiff['changed'] = [];
  for (const after of next) {
    const before = prevById.get(after.id);
    if (!before) continue;
    const fields = COMPARED.filter((f) => !sameValue(before[f], after[f]));
    if (fields.length > 0) changed.push({ before, after, fields });
  }

  const removed = prevItems
    .filter((i) => !nextIds.has(i.id))
    .map((item) => ({ item, successor: findSuccessor(item, added) }));

  const restored: Orphan[] = [];
  const orphans: Orphan[] = [];
  const expired: Orphan[] = [];
  for (const o of prev?.orphans ?? []) {
    if (nextIds.has(o.id)) restored.push(o);
    else if (daysBetween(o.since, today) > ORPHAN_TTL_DAYS) expired.push(o);
    else orphans.push(o);
  }
  for (const { item, successor } of removed) {
    const o: Orphan = { id: item.id, fr: item.fr, richtung: item.richtung, since: today };
    if (successor) o.successor = successor.id;
    orphans.push(o);
  }

  return { added, changed, removed, restored, orphans, expired };
}

const LIST_LIMIT = 40;

function list<T>(title: string, entries: T[], fmt: (e: T) => string): string[] {
  const out = [`${title}: ${entries.length}`];
  for (const e of entries.slice(0, LIST_LIMIT)) out.push(`  ${fmt(e)}`);
  if (entries.length > LIST_LIMIT) out.push(`  … und ${entries.length - LIST_LIMIT} weitere`);
  return out;
}

export function formatDiff(d: ImportDiff, firstImport: boolean): string {
  const lines: string[] = [];
  if (firstImport) {
    lines.push(`Erstimport: ${d.added.length} Einträge, kein Vergleichsstand vorhanden.`);
  } else {
    lines.push(...list('Neu', d.added, (i) => `+ ${i.id}  ${i.fr}  [${i.richtung}]`));
    lines.push(...list('Geändert (Lernzustand bleibt)', d.changed, (c) => `~ ${c.after.id}  ${c.after.fr}  (${c.fields.join(', ')})`));
    lines.push(
      ...list('Entfernt', d.removed, (r) =>
        r.successor
          ? `- ${r.item.id}  ${r.item.fr}  → vermutlich korrigiert zu „${r.successor.fr}“ (${r.successor.id})`
          : `- ${r.item.id}  ${r.item.fr}  [${r.item.richtung}]`,
      ),
    );
  }
  lines.push(...list('Wiederhergestellt (ID wieder vorhanden)', d.restored, (o) => `↺ ${o.id}  ${o.fr}`));
  lines.push(
    ...list(`Verwaist (Lernzustand wird ${ORPHAN_TTL_DAYS} Tage nach „seit“ gelöscht)`, d.orphans, (o) => `? ${o.id}  ${o.fr}  seit ${o.since}`),
  );
  lines.push(...list('Endgültig gelöscht', d.expired, (o) => `× ${o.id}  ${o.fr}  seit ${o.since}`));
  return lines.join('\n');
}
