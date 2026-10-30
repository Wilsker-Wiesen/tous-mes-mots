import { describe, expect, it } from 'vitest';
import { answerVariants, matchesAnswer, normalizeAnswer, normalizeKey, splitAnnotations } from './normalize.ts';

describe('normalizeKey', () => {
  it('NFC, Kleinschreibung, Whitespace; Klammern bleiben', () => {
    expect(normalizeKey('  Essuie-glace \t (m) ')).toBe('essuie-glace (m)');
    expect(normalizeKey('été')).toBe('été');
  });
});

describe('splitAnnotations', () => {
  it('trennt Klammerzusätze für die Anzeige ab', () => {
    expect(splitAnnotations('essuie-glace (m)')).toEqual({ head: 'essuie-glace', annotations: ['m'] });
    expect(splitAnnotations('effronté, -e (adj.)')).toEqual({ head: 'effronté, -e', annotations: ['adj.'] });
    expect(splitAnnotations('(s\')approcher (de) qn')).toEqual({ head: 'approcher qn', annotations: ["s'", 'de'] });
  });
});

describe('normalizeAnswer', () => {
  it('ignoriert Akzente, Großschreibung, Klammern, Artikel und Platzhalter', () => {
    expect(normalizeAnswer('Essuie-glace (m)')).toBe('essuie-glace');
    expect(normalizeAnswer('le brasier')).toBe('brasier');
    expect(normalizeAnswer("L’ardeur")).toBe('ardeur');
    expect(normalizeAnswer('effrontée')).toBe('effrontee');
    expect(normalizeAnswer('à l\'insu de qn')).toBe("a l'insu de");
    expect(normalizeAnswer('cœur')).toBe('coeur');
  });

  it('entfernt keine Wortanfänge, die nur wie Artikel aussehen', () => {
    expect(normalizeAnswer('lent')).toBe('lent');
    expect(normalizeAnswer('unir')).toBe('unir');
    expect(normalizeAnswer('dessus')).toBe('dessus');
  });

  it('ignoriert Satzzeichen am Rand', () => {
    expect(normalizeAnswer('à poil !')).toBe('a poil');
    expect(normalizeAnswer('à quelques jours de ...')).toBe('a quelques jours de');
  });
});

describe('answerVariants / matchesAnswer', () => {
  it('akzeptiert Synonyme mit ; einzeln', () => {
    const field = 'braise (f); brasier (m); ardeur (f)';
    expect(answerVariants(field)).toEqual(['braise', 'brasier', 'ardeur']);
    expect(matchesAnswer('la braise', field)).toBe(true);
    expect(matchesAnswer('Brasier', field)).toBe(true);
    expect(matchesAnswer('feu', field)).toBe(false);
  });

  it('trennt nicht an der Femininendung', () => {
    expect(answerVariants('effronté, -e (adj.)')).toEqual(['effronte']);
    expect(matchesAnswer('effronté', 'effronté, -e (adj.)')).toBe(true);
  });

  it('zerlegt nummerierte Bedeutungen und Kommas', () => {
    const field = '1. (Krankheit) contaminer, transmettre; 2. (Nadel) épingler; 3. (Feuer) mettre le feu à';
    expect(answerVariants(field)).toEqual(['contaminer', 'transmettre', 'epingler', 'mettre le feu a']);
  });

  it('akzeptiert Varianten mit Schrägstrich', () => {
    expect(matchesAnswer('au travers de', 'à travers qc / au travers de qc')).toBe(true);
  });

  it('leere Eingabe passt nie', () => {
    expect(matchesAnswer('  ', 'essorer')).toBe(false);
  });
});
