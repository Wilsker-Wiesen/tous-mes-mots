import { describe, expect, it } from 'vitest';
import { buildBackup, eventsCsv, lastActivity, parseBackup, planMerge, reportsFile, type Report } from './backup.ts';
import { DEFAULT_SETTINGS, type CardState, type LogEvent } from './state.ts';
import type { Item } from './types.ts';

const card = (id: string, lastReviewAt: string | null, status: CardState['status'] = 'review'): CardState =>
  ({
    cardId: `${id}/fr-de`,
    itemId: id,
    direction: 'fr-de',
    status,
    fsrs: { lastReviewAt } as never,
    introducedAt: '2026-10-01T00:00:00.000Z',
    ...(status === 'retired' ? { audit: { dueAt: '2027-01-01', intervalDays: 90, lastAt: lastReviewAt ?? '' } } : {}),
  }) as CardState;
const undo = (id: string, ts: string): LogEvent => ({ kind: 'undo', id, ts, targetId: 'x' });
const report: Report = { id: 'r1', ts: '2026-11-01T10:00:00Z', itemId: 'a', fr: 'abattis (m)', de: 'Verhau', richtung: 'FR→DE', line: 37, sicherheit: 'eigen?', reason: 'bedeutung', note: 'eher „Holzverhau“' };

const backup = (cards: CardState[], events: LogEvent[], extra = {}) =>
  buildBackup({ appVersion: 't', settings: DEFAULT_SETTINGS, bests: {}, cards, events, reports: [], ...extra }, new Date('2026-11-02T00:00:00Z'));

describe('parseBackup', () => {
  it('liest eine eigene Sicherung wieder ein', () => {
    const b = backup([card('a', '2026-11-01T00:00:00Z')], [undo('e1', '2026-11-01T00:00:00Z')]);
    expect(parseBackup(JSON.stringify(b))).toEqual({ ...b, questionAnswers: [] });
  });

  it('lehnt fremde, kaputte oder zu neue Dateien mit klarer Meldung ab', () => {
    expect(() => parseBackup('{')).toThrow(/kein gültiges JSON/);
    expect(() => parseBackup('{"format":"anderes"}')).toThrow(/keine Sicherung/);
    expect(() => parseBackup(JSON.stringify({ ...backup([], []), version: 99 }))).toThrow(/neueren/);
    expect(() => parseBackup(JSON.stringify({ ...backup([], []), cards: [{}] }))).toThrow(/fehlerhafte Karten/);
  });
});

describe('planMerge', () => {
  const local = {
    cards: [card('a', '2026-11-01T00:00:00Z'), card('b', '2026-11-05T00:00:00Z')],
    eventIds: new Set(['e1']),
    reportIds: new Set<string>(),
    bests: { sprint: 10 },
  };

  it('neuerer Kartenstand gewinnt, fehlende Ereignisse kommen dazu, Bestwerte als Maximum', () => {
    const incoming = backup(
      [card('a', '2026-11-03T00:00:00Z'), card('b', '2026-11-02T00:00:00Z'), card('c', '2026-11-01T00:00:00Z', 'retired')],
      [undo('e1', '2026-11-01T00:00:00Z'), undo('e2', '2026-11-03T00:00:00Z')],
      { bests: { sprint: 8, sudden: 4 }, reports: [report] },
    );
    const plan = planMerge(local, incoming);
    expect(plan.cards.map((c) => c.itemId)).toEqual(['a', 'c']);
    expect(plan.keptLocal).toBe(1);
    expect(plan.events.map((e) => e.id)).toEqual(['e2']);
    expect(plan.bests).toEqual({ sudden: 4 });
    expect(plan.reports).toEqual([report]);
  });

  it('Rückfragen-Antworten: nur neuere aus der Datei', () => {
    const mine = { id: 'r001', picks: ['a'], removed: [], verdict: '' as const, text: '', del: false, ts: 5 };
    const incoming = backup([], [], { questionAnswers: [{ ...mine, ts: 9, picks: ['b'] }, { ...mine, id: 'r002', ts: 1 }] });
    const plan = planMerge({ ...local, questionAnswers: new Map([['r001', mine]]) }, incoming);
    expect(plan.questionAnswers.map((a) => [a.id, a.picks])).toEqual([
      ['r001', ['b']],
      ['r002', ['a']],
    ]);
  });

  it('zweimal dieselbe Sicherung einlesen ändert nichts', () => {
    const incoming = backup(local.cards, [undo('e1', '2026-11-01T00:00:00Z')], { bests: local.bests });
    const plan = planMerge(local, incoming);
    expect([plan.cards, plan.events, plan.reports]).toEqual([[], [], []]);
    expect(plan.keptLocal).toBe(0);
  });

  it('letzte Aktivität: Stichprobe bei aussortierten Karten', () => {
    expect(lastActivity(card('c', '2026-11-04T00:00:00Z', 'retired'))).toBe('2026-11-04T00:00:00Z');
  });
});

describe('Dateien für die Chat-Sitzung und die Auswertung', () => {
  it('Meldungen enthalten Lemma, Richtung und Grund im Klartext', () => {
    const f = reportsFile([report], new Date('2026-11-02T00:00:00Z'));
    expect(f.meldungen[0]).toMatchObject({ französisch: 'abattis (m)', richtung: 'FR→DE', grund: 'Bedeutung falsch', notiz: 'eher „Holzverhau“', line: 37 });
  });

  it('CSV mit BOM, Semikolon und korrekt maskierten Feldern', () => {
    const items = new Map<string, Item>([['a', { id: 'a', fr: 'braise (f); brasier (m)' } as Item]]);
    const csv = eventsCsv([{ kind: 'game', id: 'g1', ts: 't', sessionId: 's', game: 'sprint', cardId: 'a/fr-de', itemId: 'a', correct: true, chosenItemId: 'a', optionItemIds: [], latencyMs: 800 }], items);
    expect(csv.startsWith('﻿ts;kind;')).toBe(true);
    expect(csv).toContain('"braise (f); brasier (m)"');
    expect(csv.split('\r\n')[1]!.split(';').length).toBeGreaterThan(10);
  });
});
