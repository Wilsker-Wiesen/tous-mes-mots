import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type CardsFile, type Item } from '../core/types.ts';
import { diffImport, formatDiff } from './diff.ts';
import { parseVocabulary } from './importer.ts';

const fixture = readFileSync(new URL('./fixtures/beispiel.csv', import.meta.url), 'utf8');

function snapshot(items: Item[], orphans: CardsFile['orphans'] = []): CardsFile {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '', source: { file: '', sha1: '', rows: items.length }, items, orphans };
}

/** Ersetzt eine CSV-Zeile anhand ihres Anfangs. */
function edit(csv: string, startsWith: string, replacement: string | null): string {
  return csv
    .split('\r\n')
    .flatMap((l) => (l.startsWith(startsWith) ? (replacement === null ? [] : [replacement]) : [l]))
    .join('\r\n');
}

describe('diffImport', () => {
  const v1 = parseVocabulary(fixture).items;

  it('Erstimport: alles neu', () => {
    const d = diffImport(null, v1, '2026-10-30');
    expect(d.added).toHaveLength(v1.length);
    expect(formatDiff(d, true)).toContain('Erstimport: 10 Einträge');
  });

  it('identischer Re-Import ändert nichts', () => {
    const d = diffImport(snapshot(v1), v1, '2026-10-31');
    expect([d.added, d.changed, d.removed, d.orphans].map((x) => x.length)).toEqual([0, 0, 0, 0]);
  });

  it('neue Zeilen verschieben keine bestehenden IDs (Datei bleibt sortiert)', () => {
    const v2 = parseVocabulary(edit(fixture, '"braise', 'brave (adj.);mutig;FR→DE;;;eigen\r\n"braise (f); brasier (m); ardeur (f)";Glut;DE→FR;;c.png;eigen')).items;
    const d = diffImport(snapshot(v1), v2, '2026-10-31');
    expect(d.added.map((i) => i.fr)).toEqual(['brave (adj.)']);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('Änderung an Deutsch, Notiz oder Sicherheit behält die ID', () => {
    const v2 = parseVocabulary(edit(fixture, 'essorer;', 'essorer;schleudern;FR→DE;neu;zzz.png;eigen')).items;
    const d = diffImport(snapshot(v1), v2, '2026-10-31');
    expect(d.added).toEqual([]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]!.fields).toEqual(['de', 'notiz', 'sicherheit']);
  });

  it('Änderung nur an Quelle ist keine Änderung', () => {
    const v2 = parseVocabulary(edit(fixture, 'essorer;', 'essorer;"schleudern (Wäsche); auswringen";FR→DE;;anders.png;Vorlage')).items;
    expect(diffImport(snapshot(v1), v2, '2026-10-31').changed).toEqual([]);
  });

  it('Korrektur des Lemmas: neue Karte, alte ID verwaist mit vermutetem Nachfolger', () => {
    const v2 = parseVocabulary(edit(fixture, 'essuie-glace', 'essuie-glaces (m);Scheibenwischer;FR→DE;;g.png;eigen?')).items;
    const d = diffImport(snapshot(v1), v2, '2026-10-31');
    expect(d.added.map((i) => i.fr)).toEqual(['essuie-glaces (m)']);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0]!.successor?.fr).toBe('essuie-glaces (m)');
    expect(d.orphans).toEqual([{ id: d.removed[0]!.item.id, fr: 'essuie-glace (m)', richtung: 'FR→DE', since: '2026-10-31', successor: d.added[0]!.id }]);
    expect(formatDiff(d, false)).toContain('vermutlich korrigiert zu „essuie-glaces (m)“');
  });

  it('Waisen bleiben 90 Tage, tauchen wieder auf oder werden gelöscht', () => {
    const v2 = parseVocabulary(edit(fixture, 'essorer;', null)).items;
    const d1 = diffImport(snapshot(v1), v2, '2026-11-01');
    expect(d1.orphans.map((o) => o.fr)).toEqual(['essorer']);

    const kept = diffImport(snapshot(v2, d1.orphans), v2, '2027-01-30'); // 90 Tage
    expect(kept.orphans).toHaveLength(1);
    expect(kept.expired).toEqual([]);

    const gone = diffImport(snapshot(v2, d1.orphans), v2, '2027-01-31'); // 91 Tage
    expect(gone.orphans).toEqual([]);
    expect(gone.expired.map((o) => o.fr)).toEqual(['essorer']);

    const back = diffImport(snapshot(v2, d1.orphans), v1, '2026-11-05');
    expect(back.restored.map((o) => o.fr)).toEqual(['essorer']);
    expect(back.orphans).toEqual([]);
  });

  it('Löschen eines Duplikats verschiebt das Suffix (bekannte Grenze)', () => {
    const v2 = parseVocabulary(edit(fixture, 'au besoin;nötigenfalls', null)).items;
    const d = diffImport(snapshot(v1), v2, '2026-10-31');
    // „bei Bedarf“ übernimmt die Basis-ID, deren Deutsch sich dadurch ändert; die -2-ID verwaist.
    expect(d.changed.map((c) => c.after.de)).toEqual(['bei Bedarf']);
    expect(d.removed.map((r) => r.item.id)).toEqual([`${v1[1]!.id}-2`]);
  });
});
