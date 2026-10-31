// Lernzustand, Ereignisprotokoll und Meldungen in IndexedDB. Das Protokoll wird nur ergänzt, nie geändert.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Report } from '../core/backup.ts';
import type { CardState, GameMode, LogEvent, Settings } from '../core/state.ts';
import { DEFAULT_SETTINGS } from '../core/state.ts';

interface TmmDB extends DBSchema {
  cards: { key: string; value: CardState; indexes: { byItem: string } };
  events: { key: string; value: LogEvent; indexes: { byTs: string } };
  meta: { key: string; value: unknown };
  reports: { key: string; value: Report; indexes: { byItem: string } };
}

const GAMES: GameMode[] = ['sprint', 'sudden'];

export interface Store {
  allStates(): Promise<CardState[]>;
  /** Neuer Kartenzustand und zugehöriges Ereignis in einer Transaktion. */
  record(state: CardState, event: LogEvent): Promise<void>;
  /** Rückgängig: Zustand zurücksetzen (null = löschen) und Undo-Ereignis anhängen. */
  revert(cardId: string, prev: CardState | null, event: LogEvent): Promise<void>;
  deleteStates(cardIds: string[]): Promise<void>;
  allEvents(): Promise<LogEvent[]>;
  eventIds(): Promise<Set<string>>;
  /** Ereignis ohne Zustandsänderung anhängen (z. B. Spielzug). */
  log(event: LogEvent): Promise<void>;
  /** Import einer Sicherung in einer Transaktion: Zustände setzen, fehlende Ereignisse und Meldungen ergänzen. */
  importMerged(input: { cards: CardState[]; events: LogEvent[]; reports: Report[]; bests: Partial<Record<GameMode, number>> }): Promise<void>;
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<void>;
  getBest(game: GameMode): Promise<number>;
  setBest(game: GameMode, score: number): Promise<void>;
  allBests(): Promise<Partial<Record<GameMode, number>>>;
  addReport(r: Report): Promise<void>;
  allReports(): Promise<Report[]>;
  deleteReports(ids: string[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export async function openStore(name = 'tous-mes-mots'): Promise<Store> {
  const db: IDBPDatabase<TmmDB> = await openDB<TmmDB>(name, 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('cards', { keyPath: 'cardId' }).createIndex('byItem', 'itemId');
        d.createObjectStore('events', { keyPath: 'id' }).createIndex('byTs', 'ts');
        d.createObjectStore('meta');
      }
      if (oldVersion < 2) {
        d.createObjectStore('reports', { keyPath: 'id' }).createIndex('byItem', 'itemId');
      }
    },
  });

  const getBest = async (game: GameMode) => ((await db.get('meta', `best:${game}`)) as number | undefined) ?? 0;

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

    async eventIds() {
      return new Set((await db.getAllKeys('events')) as string[]);
    },

    async log(event) {
      await db.add('events', event);
    },

    async importMerged({ cards, events, reports, bests }) {
      const tx = db.transaction(['cards', 'events', 'reports', 'meta'], 'readwrite');
      const ops: Promise<unknown>[] = [
        ...cards.map((c) => tx.objectStore('cards').put(c)),
        ...events.map((e) => tx.objectStore('events').put(e)),
        ...reports.map((r) => tx.objectStore('reports').put(r)),
        ...Object.entries(bests).map(([g, v]) => tx.objectStore('meta').put(v, `best:${g}`)),
      ];
      await Promise.all([...ops, tx.done]);
    },

    async getSettings() {
      const s = (await db.get('meta', 'settings')) as Partial<Settings> | undefined;
      return { ...DEFAULT_SETTINGS, ...s };
    },

    async setSettings(s) {
      await db.put('meta', s, 'settings');
    },

    getBest,

    async setBest(game, score) {
      await db.put('meta', score, `best:${game}`);
    },

    async allBests() {
      const out: Partial<Record<GameMode, number>> = {};
      for (const g of GAMES) {
        const v = await getBest(g);
        if (v > 0) out[g] = v;
      }
      return out;
    },

    async addReport(r) {
      await db.put('reports', r);
    },

    allReports: () => db.getAll('reports'),

    async deleteReports(ids) {
      const tx = db.transaction('reports', 'readwrite');
      await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
    },

    async getMeta<T>(key: string) {
      return (await db.get('meta', key)) as T | undefined;
    },

    async setMeta(key, value) {
      await db.put('meta', value, key);
    },
  };
}
