import { describe, expect, it } from 'vitest';
import { exportAnswers, type Question } from './questions.ts';
import { buildAnswer, describeAnswer, fallbackScript, numbersIn, parseIntent, proposalToPatch, questionContext, splitSpeech } from './voice-questions.ts';

const single: Question = { id: 'a1', group: 'singles', q: 'Welche Fassung?', opts: ['chat = Katze', 'chat = Kater', 'chat = Plauderei'], cur: [0], multi: false };
const multi: Question = { ...single, id: 'a2', multi: true };
const meanings: Question = { id: 'a3', group: 'g1', title: 'Schloss', chips: ['serrure (f)', 'château (m)', 'cadenas (m)'], side: 'fr' };
const note: Question = { id: 'a4', group: 'g2', jan: 'cvb', res: 'ça va bien' };
const cut: Question = { id: 'a5', group: 'g3', jan: 'faire la', res: 'faire la cuisine' };
const keep: Question = { id: 'a6', group: 'g4', fr: 'pomme', de: 'Apfel' };
const added: Question = { id: 'a7', group: 'g5', fr: 'poire', de: 'Birne' };
const begag: Question = { id: 'a8', group: 'g7', fr: 'prune', de: 'Pflaume' };

describe('Sprechtext aufteilen', () => {
  it('wechselt bei geschweiften Klammern die Sprache', () => {
    expect(splitSpeech('Unter Katze steht {le chat} und {la chatte}.')).toEqual([
      { text: 'Unter Katze steht', lang: 'de-DE' },
      { text: 'le chat', lang: 'fr-FR' },
      { text: 'und', lang: 'de-DE' },
      { text: 'la chatte', lang: 'fr-FR' },
      { text: '.', lang: 'de-DE' },
    ]);
    expect(splitSpeech('{oui}')).toEqual([{ text: 'oui', lang: 'fr-FR' }]);
  });
});

describe('Zahlen', () => {
  it('erkennt Wörter, Ziffern und Füllwörter', () => {
    expect(numbersIn('option zwei')).toEqual([2]);
    expect(numbersIn('1 und 3')).toEqual([1, 3]);
    expect(numbersIn('die erste')).toEqual([1]);
    expect(numbersIn('zwei katzen')).toBeNull();
    expect(numbersIn('die')).toBeNull();
  });
});

describe('Einzelfragen', () => {
  it('eine Zahl wählt die Option wörtlich', () => {
    expect(parseIntent(single, ['Option zwei'])).toEqual({ kind: 'decide', patch: { picks: ['chat = Kater'] } });
  });
  it('mehrere nur bei Mehrfachwahl', () => {
    expect(parseIntent(single, ['eins und zwei']).kind).toBe('refuse');
    expect(parseIntent(multi, ['eins und zwei'])).toEqual({ kind: 'decide', patch: { picks: ['chat = Katze', 'chat = Kater'] } });
    expect(parseIntent(multi, ['alle'])).toEqual({ kind: 'decide', patch: { picks: multi.opts } });
  });
  it('Nummer außerhalb der Auswahl wird abgelehnt', () => {
    expect(parseIntent(single, ['fünf']).kind).toBe('refuse');
  });
  it('„Vorschlag“ übernimmt, was jetzt in der Liste steht', () => {
    expect(parseIntent(single, ['Vorschlag'])).toEqual({ kind: 'decide', patch: { picks: ['chat = Katze'] } });
  });
  it('streichen und eigene Fassung', () => {
    expect(parseIntent(single, ['Streichen'])).toEqual({ kind: 'decide', patch: { del: true } });
    expect(parseIntent(single, ['eigene Fassung: chat ist eine Katze'])).toEqual({ kind: 'dictate', patch: {}, inline: 'chat ist eine Katze', lang: 'de-DE' });
    expect(parseIntent(single, ['eigene Fassung Französisch le chat'])).toEqual({ kind: 'dictate', patch: {}, inline: 'le chat', lang: 'fr-FR' });
    expect(parseIntent(single, ['eigene Fassung'])).toEqual({ kind: 'dictate', patch: {}, inline: '', lang: 'de-DE' });
  });
});

describe('Mehrere Bedeutungen', () => {
  it('Zahl nimmt raus, „nur“ behält', () => {
    expect(parseIntent(meanings, ['zwei'])).toEqual({ kind: 'decide', patch: { removed: ['château (m)'] } });
    expect(parseIntent(meanings, ['zwei streichen'])).toEqual({ kind: 'decide', patch: { removed: ['château (m)'] } });
    expect(parseIntent(meanings, ['nur eins'])).toEqual({ kind: 'decide', patch: { removed: ['château (m)', 'cadenas (m)'] } });
    expect(parseIntent(meanings, ['alle behalten'])).toEqual({ kind: 'decide', patch: { removed: [] } });
  });
  it('alle zu entfernen geht nicht', () => {
    expect(parseIntent(meanings, ['eins zwei drei']).kind).toBe('refuse');
  });
});

describe('Urteile', () => {
  it('je Gruppe das passende Urteil', () => {
    expect(parseIntent(note, ['stimmt'])).toEqual({ kind: 'decide', patch: { verdict: 'stimmt' } });
    expect(parseIntent(cut, ['so lassen'])).toEqual({ kind: 'decide', patch: { verdict: 'lassen' } });
    expect(parseIntent(keep, ['behalten'])).toEqual({ kind: 'decide', patch: { verdict: 'behalten' } });
    expect(parseIntent(added, ['passt'])).toEqual({ kind: 'decide', patch: { verdict: 'passt' } });
    expect(parseIntent(begag, ['aufnehmen'])).toEqual({ kind: 'decide', patch: { verdict: 'aufnehmen' } });
  });
  it('„falsch“ verlangt die richtige Fassung', () => {
    expect(parseIntent(note, ['falsch'])).toEqual({ kind: 'dictate', patch: { verdict: 'falsch' }, inline: '', lang: 'de-DE' });
  });
  it('Fortsetzung vor Navigation: „weiter geht es mit …“ überspringt nicht', () => {
    expect(parseIntent(cut, ['weiter geht es mit der Küche'])).toEqual({ kind: 'dictate', patch: {}, inline: 'der Küche', lang: 'de-DE' });
    expect(parseIntent(cut, ['weiter'])).toEqual({ kind: 'nav', command: 'skip' });
  });
  it('Begag: nicht aufnehmen lässt die Frage offen, Streichen gibt es dort nicht', () => {
    expect(parseIntent(begag, ['nicht aufnehmen'])).toEqual({ kind: 'leave' });
    expect(parseIntent(begag, ['streichen']).kind).toBe('unknown');
  });
});

describe('Navigation und Unbekanntes', () => {
  it('Navigation und Frage', () => {
    expect(parseIntent(single, ['Warum?'])).toEqual({ kind: 'nav', command: 'why' });
    expect(parseIntent(single, ['Original'])).toEqual({ kind: 'nav', command: 'original' });
    expect(parseIntent(single, ['überspringen'])).toEqual({ kind: 'nav', command: 'skip' });
    expect(parseIntent(single, ['Frage: was heißt das genau'])).toEqual({ kind: 'ask', text: 'was heißt das genau' });
  });
  it('prüft alle Alternativen der Erkennung', () => {
    expect(parseIntent(single, ['Warnung', 'warum'])).toEqual({ kind: 'nav', command: 'why' });
  });
  it('Unbekanntes bleibt als Text erhalten', () => {
    expect(parseIntent(single, ['Ist das umgangssprachlich?'])).toEqual({ kind: 'unknown', text: 'Ist das umgangssprachlich?' });
  });
});

describe('Antwort bauen', () => {
  it('Entscheidung ohne Freitext zählt direkt', () => {
    const { answer, problem } = buildAnswer(single, { picks: ['chat = Kater'] }, 5);
    expect(problem).toBeNull();
    expect(answer).toEqual({ id: 'a1', picks: ['chat = Kater'], removed: [], verdict: '', text: '', del: false, ts: 5 });
    expect(describeAnswer(single, answer)).toBe('Option 2.');
  });
  it('Freitext wird zum Prüfen markiert, aber nicht exportiert', () => {
    const { answer } = buildAnswer(note, { verdict: 'falsch', text: ' ça va ' }, 5);
    expect(answer.unterwegs).toBe(true);
    expect(answer.text).toBe('ça va');
    expect(exportAnswers([answer]).a4).not.toHaveProperty('unterwegs');
  });
  it('„falsch“ ohne Text ist ungültig', () => {
    expect(buildAnswer(note, { verdict: 'falsch' }, 5).problem).not.toBeNull();
  });
});

describe('Claude', () => {
  it('der Kontext enthält nur diese Frage und kein Bild', () => {
    const q: Question = { ...single, bild: 'bilder/a1.jpg', original: { src: 'Vocs', lines: [{ t: 'chat', n: 3 }], ctx: [] } };
    const c = questionContext(q, fallbackScript(q));
    expect(c).toContain('Sein Original (Vocs): chat');
    expect(c).not.toContain('a1.jpg');
  });
  it('Vorschlag: Nummern werden zu wörtlichen Texten', () => {
    const empty = { picks: [], removed: [], verdict: '' as const, text: '', del: false };
    expect(proposalToPatch(single, { ...empty, picks: [2] })).toEqual({ patch: { ...empty, picks: ['chat = Kater'] } });
    expect(proposalToPatch(meanings, { ...empty, removed: [3] })).toEqual({ patch: { ...empty, removed: ['cadenas (m)'] } });
    expect(proposalToPatch(single, { ...empty, picks: [9] })).toEqual({ problem: 'Diese Nummer gibt es nicht.' });
  });
  it('Ersatztext für Fragen ohne Sprechtext', () => {
    expect(fallbackScript(meanings).optionen).toEqual(['{serrure (f)}', '{château (m)}', '{cadenas (m)}']);
    expect(fallbackScript(begag).kurz).toContain('Aufnehmen?');
  });
});
