// Gemeinsames Datenformat zwischen Import (Node) und App (Browser).
// Bewusst ohne Abhängigkeiten, damit es später auch eine native App oder ein Sync-Server nutzen kann.

export const SCHEMA_VERSION = 1;

/** Ursprüngliche Nachschlagerichtung laut CSV-Spalte `Richtung`. */
export type Richtung = 'FR→DE' | 'DE→FR';
export type Sicherheit = 'Vorlage' | 'eigen' | 'eigen?';
/** Abfragerichtung einer Karte: fr-de = Erkennen, de-fr = Produzieren. */
export type Direction = 'fr-de' | 'de-fr';

/** Eine CSV-Zeile, normalisiert. Lernzustand gehört nie hierher. */
export interface Item {
  /** Stabile ID: sha1(normalizeKey(fr) + "|" + richtung), 12 Hex-Zeichen, bei Kollision "-2", "-3". */
  id: string;
  fr: string;
  de: string;
  richtung: Richtung;
  notiz: string;
  sicherheit: Sicherheit;
  /** Notiz enthält „Expression“: eigene gesprochene Wendung. */
  expression: boolean;
  /** Karten, die aus dieser Zeile entstehen; die erste ist die Startkarte. */
  directions: Direction[];
  /** Zeilennummer in der CSV (1 = erste Datenzeile), nur zur Orientierung im Diff-Protokoll. */
  line: number;
}

/** Item, dessen ID beim Import verschwunden ist. Der Lernzustand bleibt so lange erhalten. */
export interface Orphan {
  id: string;
  fr: string;
  richtung: Richtung;
  /** Datum (YYYY-MM-DD) des Imports, bei dem die ID zuerst fehlte. */
  since: string;
  /** Vermuteter Nachfolger (z. B. nach einer Korrektur des Lemmas). */
  successor?: string;
}

export interface CardsFile {
  schemaVersion: number;
  generatedAt: string;
  source: { file: string; sha1: string; rows: number };
  items: Item[];
  orphans: Orphan[];
}

export function cardId(itemId: string, direction: Direction): string {
  return `${itemId}/${direction}`;
}
