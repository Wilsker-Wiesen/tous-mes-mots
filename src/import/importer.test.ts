import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.ts';
import { baseId, parseVocabulary } from './importer.ts';

const fixture = readFileSync(new URL('./fixtures/beispiel.csv', import.meta.url), 'utf8');

describe('parseCsv', () => {
  it('entfernt BOM, liest Anführungszeichen, verdoppelte Quotes und CRLF', () => {
    const rows = parseCsv('﻿a;b\r\n"x; y";"sagt ""hallo"""\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x; y', 'sagt "hallo"'],
    ]);
  });

  it('erlaubt Zeilenumbrüche innerhalb von Feldern und fehlenden Schluss-Umbruch', () => {
    expect(parseCsv('"a\nb";c')).toEqual([['a\nb', 'c']]);
  });

  it('meldet ein nicht geschlossenes Anführungszeichen', () => {
    expect(() => parseCsv('"offen;x')).toThrow();
  });
});

describe('stabile IDs', () => {
  it('sind 12 Hex-Zeichen aus sha1(normalize(fr) + "|" + Richtung)', () => {
    // sha1("essorer|FR→DE") – unabhängig mit Python hashlib nachgerechnet
    expect(baseId('essorer', 'FR→DE')).toMatch(/^[0-9a-f]{12}$/);
    expect(baseId('essorer', 'FR→DE')).toBe('252a72151782');
  });

  it('ignorieren Groß-/Kleinschreibung und Whitespace, nicht aber Klammerzusätze', () => {
    expect(baseId('  Essuie-glace   (m) ', 'FR→DE')).toBe(baseId('essuie-glace (m)', 'FR→DE'));
    expect(baseId('essuie-glace', 'FR→DE')).not.toBe(baseId('essuie-glace (m)', 'FR→DE'));
  });

  it('unterscheiden die Richtung', () => {
    expect(baseId('essuyer', 'FR→DE')).not.toBe(baseId('essuyer', 'DE→FR'));
  });

  it('sind NFC-normalisiert (zerlegte Akzente ergeben dieselbe ID)', () => {
    expect(baseId('effronté', 'FR→DE')).toBe(baseId('effronté', 'FR→DE'));
  });
});

describe('parseVocabulary', () => {
  const { items, collisions, warnings } = parseVocabulary(fixture);
  const byFr = (fr: string) => items.filter((i) => i.fr === fr);

  it('liest alle Zeilen und verwirft die Spalte Quelle', () => {
    expect(items).toHaveLength(10);
    expect(warnings).toEqual([]);
    expect(Object.keys(items[0]!)).not.toContain('quelle');
  });

  it('vergibt bei Kollision Suffixe nach Dateireihenfolge', () => {
    const [a, b] = byFr('au besoin');
    expect(a!.id).toBe(baseId('au besoin', 'DE→FR'));
    expect(b!.id).toBe(`${a!.id}-2`);
    expect(collisions).toEqual([{ key: 'au besoin|DE→FR', ids: [a!.id, b!.id], lines: [2, 3] }]);
  });

  it('gibt gleichem Lemma in beiden Richtungen getrennte IDs ohne Suffix', () => {
    const ids = byFr('essuyer').map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => !id.includes('-'))).toBe(true);
  });

  it('erzeugt zwei Karten, Startkarte nach Richtung; Expressions nur fr→de', () => {
    expect(byFr('essorer')[0]!.directions).toEqual(['fr-de', 'de-fr']);
    expect(byFr('braise (f); brasier (m); ardeur (f)')[0]!.directions).toEqual(['de-fr', 'fr-de']);
    const expr = byFr('à la longue')[0]!;
    expect(expr.expression).toBe(true);
    expect(expr.directions).toEqual(['fr-de']);
  });

  it('übernimmt Felder unverändert, auch mit Anführungszeichen und Klammern', () => {
    const e = byFr('essuie-glace (m)')[0]!;
    expect(e.notiz).toBe('Notiz mit "Anführungszeichen"');
    expect(e.sicherheit).toBe('eigen?');
    expect(byFr('esquiver')[0]!.de).toBe("1. (Schlag) ausweichen 2. umgehen; s'esquiver = sich davonstehlen");
  });

  it('bricht bei falscher Kopfzeile oder Spaltenzahl ab', () => {
    expect(() => parseVocabulary('a;b\n')).toThrow(/Kopfzeile/);
    const header = 'Französisch;Deutsch;Richtung;Notiz;Quelle;Sicherheit\n';
    expect(() => parseVocabulary(`${header}x;y;FR→DE\n`)).toThrow(/Spalten/);
    expect(() => parseVocabulary(`${header}x;y;FR-DE;;;eigen\n`)).toThrow(/Richtung/);
  });

  it('warnt bei unbekannter Sicherheit und behandelt sie als unsicher', () => {
    const r = parseVocabulary('Französisch;Deutsch;Richtung;Notiz;Quelle;Sicherheit\nx;y;FR→DE;;;vielleicht\n');
    expect(r.items[0]!.sicherheit).toBe('eigen?');
    expect(r.warnings).toHaveLength(1);
  });
});
