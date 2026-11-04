import { describe, expect, it } from 'vitest';
import { normalizeSpoken, parseCommand, speakFrench, speakGerman, spokenMatch } from './voice.ts';

describe('Vorlesen', () => {
  it('Französisch ohne Klammern, Platzhalter ausgeschrieben, ohne Femininendung', () => {
    expect(speakFrench('essuie-glace (m)')).toBe('essuie-glace');
    expect(speakFrench('rendre service à qn')).toBe("rendre service à quelqu'un");
    expect(speakFrench('effronté, -e (adj.)')).toBe('effronté');
  });

  it('Deutsch: Bedeutungen ohne Beispiele, höchstens drei', () => {
    expect(speakGerman('1. jdm etw. leihen 2. borgen; ausleihen; verleihen; prêter main-forte = helfen')).toBe(
      'jemandem etwas leihen; borgen; ausleihen',
    );
    expect(speakGerman('die Wolke (am Himmel)')).toBe('die Wolke');
  });
});

describe('Gesprochenes vergleichen', () => {
  it('Artikel, Füllwörter und Großschreibung spielen keine Rolle', () => {
    expect(normalizeSpoken('Der Staub')).toBe('staub');
    expect(normalizeSpoken('sich beeilen')).toBe('beeilen');
  });

  it('Deutsch → passt zu einer der Bedeutungen', () => {
    expect(spokenMatch(['Staub'], 'der Staub; der Puder', 'de-DE')).toBe('Staub');
    expect(spokenMatch(['Puder'], 'der Staub; der Puder', 'de-DE')).toBe('Puder');
    expect(spokenMatch(['jemandem etwas leihen'], 'jdm etw. leihen', 'de-DE')).toBe('jemandem etwas leihen');
  });

  it('Variante im längeren Satz zählt ab vier Zeichen', () => {
    expect(spokenMatch(['ich glaube der Staub'], 'der Staub', 'de-DE')).not.toBeNull();
    expect(spokenMatch(['es ist da'], 'da', 'de-DE')).toBeNull();
  });

  it('nimmt die erste passende Alternative der Erkennung', () => {
    expect(spokenMatch(['la poussée', 'la poussière'], 'poussière (f)', 'fr-FR')).toBe('la poussière');
  });

  it('Französisch: Artikel und Akzente egal, Platzhalter optional', () => {
    expect(spokenMatch(['la Poussiere'], 'poussière (f)', 'fr-FR')).not.toBeNull();
    expect(spokenMatch(["rendre service à quelqu'un"], 'rendre service à qn', 'fr-FR')).not.toBeNull();
    expect(spokenMatch(['rendre service'], 'rendre service à qn', 'fr-FR')).not.toBeNull();
  });

  it('falsche Antwort passt nicht', () => {
    expect(spokenMatch(['Wolke'], 'der Staub', 'de-DE')).toBeNull();
    expect(spokenMatch([''], 'der Staub', 'de-DE')).toBeNull();
  });
});

describe('Sprachbefehle', () => {
  it('erkennt Befehle in beiden Sprachen, ohne Akzente und ß', () => {
    expect(parseCommand(['Weiß nicht'], ['dontknow'])).toBe('dontknow');
    expect(parseCommand(['Je ne sais pas.'], ['dontknow'])).toBe('dontknow');
    expect(parseCommand(['Zurück'], ['undo'])).toBe('undo');
    expect(parseCommand(['Répète'], ['repeat'])).toBe('repeat');
  });

  it('nur ganze Äußerungen und nur erlaubte Befehle', () => {
    expect(parseCommand(['passer'], ['dontknow'])).toBeNull();
    expect(parseCommand(['Pause'], ['dontknow', 'repeat'])).toBeNull();
    expect(parseCommand(['weiter'], ['resume'])).toBe('resume');
  });
});
