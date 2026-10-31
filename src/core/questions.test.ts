import { describe, expect, it } from 'vitest';
import { draftFor, exportAnswers, mergeAnswers, normalizeAnswer, prefill, questionsFrom, validate, type Answer, type Catalog } from './questions.ts';

// Selbst erstellter Mini-Katalog im Format der Chat-Sitzung (keine echten Daten).
const catalog: Catalog = {
  stand: '2026-10-31',
  gruppen: { singles: 'Einzelfragen', g1: 'Mehrere Bedeutungen' },
  fragen: {
    singles: [{ id: 'r001', q: 'Wie soll der Eintrag aussehen?', opts: ['a = x', 'b = y'], multi: false, cur: [1], note: '', fr: 'a', de: 'x', dir: 'FR→DE', q0: 'Pages' }],
    g1: [{ id: 'r002', title: 'Bank', chips: ['banc (m)', 'banque (f)'], side: 'fr', dir: 'DE→FR' }],
    g2: [{ id: 'r003', jan: 'lautschrift', res: 'aufgelöste Fassung' }],
    g3: [{ id: 'r004', jan: 'abc …', res: 'abc def' }],
    g7: [{ id: 'b01', fr: 'mot (m)', de: 'Wort', q0: 'Quelle' }],
    auto: [{ id: 'a01', fr: 'x', de: 'y' }],
    skipped: [{ q: 'egal', why: 'unleserlich' }],
  },
};
const qs = questionsFrom(catalog);
const q = (id: string) => qs.find((x) => x.id === id)!;
const answer = (over: Partial<Answer> & { id: string }): Answer => ({ picks: [], removed: [], verdict: '', text: '', del: false, ts: 1, ...over });

describe('questionsFrom', () => {
  it('nur beantwortbare Gruppen, in Katalogreihenfolge, mit Gruppe', () => {
    expect(qs.map((x) => [x.id, x.group])).toEqual([
      ['r001', 'singles'],
      ['r002', 'g1'],
      ['r003', 'g2'],
      ['r004', 'g3'],
      ['b01', 'g7'],
    ]);
  });
});

describe('draftFor', () => {
  it('Einzelfrage startet mit dem Vorschlag aus cur', () => {
    expect(draftFor(q('r001'), undefined).picks).toEqual(['b = y']);
  });
  it('vorhandene Antwort wird übernommen, nicht verändert', () => {
    const a = answer({ id: 'r002', removed: ['banc (m)'] });
    const d = draftFor(q('r002'), a);
    d.removed.push('banque (f)');
    expect(a.removed).toEqual(['banc (m)']);
  });
});

describe('validate', () => {
  it('Einzelfrage: Auswahl, eigene Fassung oder streichen; bei Einfachwahl nur eine', () => {
    expect(validate(q('r001'), answer({ id: 'r001' }))).toMatch(/Option wählen/);
    expect(validate(q('r001'), answer({ id: 'r001', text: 'eigene Fassung' }))).toBeNull();
    expect(validate(q('r001'), answer({ id: 'r001', picks: ['a = x', 'b = y'] }))).toMatch(/nur eine/);
    expect(validate(q('r001'), answer({ id: 'r001', del: true }))).toBeNull();
  });
  it('mehrere Bedeutungen: nicht alle entfernen', () => {
    expect(validate(q('r002'), answer({ id: 'r002', removed: ['banc (m)', 'banque (f)'] }))).toMatch(/Mindestens eine/);
    expect(validate(q('r002'), answer({ id: 'r002', removed: ['banc (m)'] }))).toBeNull();
  });
  it('Notiz aufgelöst: bei „falsch“ ist der Text Pflicht', () => {
    expect(validate(q('r003'), answer({ id: 'r003', verdict: 'falsch' }))).toMatch(/richtige Fassung/);
    expect(validate(q('r003'), answer({ id: 'r003', verdict: 'falsch', text: 'richtige Fassung' }))).toBeNull();
  });
  it('abgebrochene Zeile: Fortsetzung oder lassen', () => {
    expect(validate(q('r004'), answer({ id: 'r004' }))).not.toBeNull();
    expect(validate(q('r004'), answer({ id: 'r004', verdict: 'lassen' }))).toBeNull();
  });
});

describe('Vorbelegen, Zusammenführen, Export', () => {
  it('bisherige Antworten ergänzen nur Fehlendes und werden vervollständigt', () => {
    const local = new Map([['r001', answer({ id: 'r001', picks: ['a = x'], ts: 5 })]]);
    const out = prefill(local, { r001: { id: 'r001', picks: ['b = y'] }, r014: { id: 'r014', picks: ['z'], text: 'eigene Notiz', ts: 3 } as never });
    expect(out.get('r001')!.picks).toEqual(['a = x']);
    expect(out.get('r014')).toEqual({ id: 'r014', picks: ['z'], removed: [], verdict: '', text: 'eigene Notiz', del: false, ts: 3 });
  });

  it('jüngere Antwort gewinnt beim Zusammenführen', () => {
    const local = new Map([['r001', answer({ id: 'r001', picks: ['a = x'], ts: 5 })]]);
    expect(mergeAnswers(local, [answer({ id: 'r001', picks: ['b = y'], ts: 9 })]).get('r001')!.picks).toEqual(['b = y']);
    expect(mergeAnswers(local, [answer({ id: 'r001', picks: ['b = y'], ts: 2 })]).get('r001')!.picks).toEqual(['a = x']);
  });

  it('Export: Schlüssel = id, genau die Felder aus dem README, sortiert', () => {
    const out = exportAnswers([answer({ id: 'r002', removed: ['banc (m)'], ts: 7 }), normalizeAnswer({ id: 'r001', picks: ['a = x'] })]);
    expect(Object.keys(out)).toEqual(['r001', 'r002']);
    expect(Object.keys(out.r001!)).toEqual(['id', 'picks', 'removed', 'verdict', 'text', 'del', 'ts']);
    expect(JSON.parse(JSON.stringify(out)).r002).toEqual({ id: 'r002', picks: [], removed: ['banc (m)'], verdict: '', text: '', del: false, ts: 7 });
  });
});
