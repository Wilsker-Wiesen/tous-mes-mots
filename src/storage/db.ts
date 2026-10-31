// Lernzustand und Ereignisprotokoll in IndexedDB. Das Protokoll wird nur ergänzt, nie geändert.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CardState, GameMode, LogEvent, Settings } from '../core/state.ts';
import { DEFAULT_SETTINGS } from '../core/state.ts';

interface TmmDB extends DBSchema {
  cards: { key: string; value: CardState; indexes: { byItem: string } };
  events: { key: string; value: LogEvent; indexes: { byTs: string } };
  meta: { key: string; value: unknown };
}

export interface Store {
  allStates(): Promise<CardState[]>;
  /** Neuer Kartenzustand und zugehöriges Ereignis in einer Transaktion. */
  record(state: CardState, event: LogEvent): Promise<void>;
  /** Rückgängig: Zustand zurücksetzen (null = löschen) und Undo-Ereignis anhängen. */
  revert(cardId: string, prev: CardState | null, event: LogEvent): Promise<void>;
  deleteStates(cardIds: string[]): Promise<void>;
  allEvents(): Promise<LogEvent[]>;
  /** Ereignis ohne Zustandsänderung anhängen (z. B. Spielzug). */
  log(event: LogEvent): Promise<void>;
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<void>;
  getBest(game: GameMode): Promise<number>;
  setBest(game: GameMode, score: number): Promise<void>;
}

export async function openStore(name = 'tous-mes-mots'): Promise<Store> {
  const db: IDBPDatabase<TmmDB> = await openDB<TmmDB>(name, 1, {
    upgrade(d) {
      d.createObjectStore('cards', { keyPath: 'cardId' }).createIndex('byItem', 'itemId');
      d.createObjectStore('events', { keyPath: 'id' }).createIndex('byTs', 'ts');
      d.createObjectStore('meta');
    },
  });

  return {
    allStates: () => db.getAll('cards'),

    async record(state, event) {
      const tx = db.transaction(['cards', 'events'], 'readwrite');
      await Promise.all([tx.objectStore('cards').put(state), tx.objectStore('events').add(event), tx.done]);
    },

    async revert(cardId, prev, event) {
      const tx = db.transaction(['cards', 'events'], 'readwrite');
      const cards = tx.objectStore('cards');
      await Promise.all([prev ? cards.put(prev) : cards.delete(cardId), tx.objectStore('events').add(event), tx.done]);
    },

    async deleteStates(cardIds) {
      const tx = db.transaction('cards', 'readwrite');
      await Promise.all([...cardIds.map((id) => tx.store.delete(id)), tx.done]);
    },

    allEvents: () => db.getAllFromIndex('events', 'byTs'),

    async log(event) {
      await db.add('events', event);
    },

    async getBest(game) {
      return ((await db.get('meta', `best:${game}`)) as number | undefined) ?? 0;
    },

    async setBest(game, score) {
      await db.put('meta', score, `best:${game}`);
    },

    async getSettings() {
      const s = (await db.get('meta', 'settings')) as Partial<Settings> | undefined;
      return { ...DEFAULT_SETTINGS, ...s };
    },

    async setSettings(s) {
      await db.put('meta', s, 'settings');
    },
  };
}
