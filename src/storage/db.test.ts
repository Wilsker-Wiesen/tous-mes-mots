import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type CardState, type LogEvent } from '../core/state.ts';
import { openDB } from 'idb';
import { openStore } from './db.ts';

const state = (cardId: string, stability: number): CardState =>
  ({ cardId, itemId: cardId.split('/')[0]!, direction: 'fr-de', status: 'review', fsrs: { stability } as never, introducedAt: '2026-11-01T09:00:00.000Z' }) as CardState;
const ev = (id: string, ts: string): LogEvent => ({ kind: 'undo', id, ts, targetId: 'x' });

describe('Store', () => {
  it('speichert Zustand und Ereignis gemeinsam und nimmt zurück', async () => {
    const s = await openStore('t1');
    await s.record(state('a/fr-de', 1), ev('e1', '2026-11-01T09:00:00Z'));
    await s.record(state('a/fr-de', 5), ev('e2', '2026-11-01T09:01:00Z'));
    expect((await s.allStates())[0]!.fsrs.stability).toBe(5);
    await s.revert('a/fr-de', state('a/fr-de', 1), ev('e3', '2026-11-01T09:02:00Z'));
    expect((await s.allStates())[0]!.fsrs.stability).toBe(1);
    await s.revert('a/fr-de', null, ev('e4', '2026-11-01T09:03:00Z'));
    expect(await s.allStates()).toEqual([]);
    expect((await s.allEvents()).map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('lehnt doppelte Ereignis-IDs ab (Protokoll nur anhängen)', async () => {
    const s = await openStore('t2');
    await s.record(state('a/fr-de', 1), ev('e1', '2026-11-01T09:00:00Z'));
    await expect(s.record(state('a/fr-de', 2), ev('e1', '2026-11-01T09:00:00Z'))).rejects.toThrow();
    expect((await s.allStates())[0]!.fsrs.stability).toBe(1);
  });

  it('Einstellungen mit Standardwerten', async () => {
    const s = await openStore('t3');
    expect((await s.getSettings()).newPerDay).toBe(20);
    await s.setSettings({ ...DEFAULT_SETTINGS, newPerDay: 10 });
    expect((await s.getSettings()).newPerDay).toBe(10);
  });

  it('Upgrade von Version 1 behält Daten und ergänzt Meldungen', async () => {
    const v1 = await openDB('t4', 1, {
      upgrade(d) {
        d.createObjectStore('cards', { keyPath: 'cardId' }).createIndex('byItem', 'itemId');
        d.createObjectStore('events', { keyPath: 'id' }).createIndex('byTs', 'ts');
        d.createObjectStore('meta');
      },
    });
    await v1.put('cards', state('a/fr-de', 3));
    v1.close();
    const s = await openStore('t4');
    expect((await s.allStates())[0]!.fsrs.stability).toBe(3);
    await s.addReport({ id: 'r', ts: '', itemId: 'a', fr: 'a', de: 'b', richtung: 'FR→DE', line: 1, sicherheit: 'eigen', reason: 'sonstiges', note: '' });
    expect(await s.allReports()).toHaveLength(1);
    await s.deleteReports(['r']);
    expect(await s.allReports()).toHaveLength(0);
  });

  it('Import in einer Transaktion: Karten, Ereignisse, Bestwerte', async () => {
    const s = await openStore('t5');
    await s.importMerged({ cards: [state('a/fr-de', 7)], events: [ev('e1', '2026-11-01T09:00:00Z')], reports: [], bests: { sprint: 12 } });
    expect((await s.allStates())[0]!.fsrs.stability).toBe(7);
    expect([...(await s.eventIds())]).toEqual(['e1']);
    expect(await s.allBests()).toEqual({ sprint: 12 });
  });
});
