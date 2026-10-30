import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { CardState, LogEvent } from '../core/state.ts';
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
    await s.setSettings({ newPerDay: 10, sessionSize: 30, desiredRetention: 0.9 });
    expect((await s.getSettings()).newPerDay).toBe(10);
  });
});
