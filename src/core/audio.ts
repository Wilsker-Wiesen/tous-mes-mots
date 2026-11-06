// Vorab erzeugte Sprachaufnahmen: welche Texte es gibt und wie sie verschlüsselt in Paketen liegen.
// Die Pakete (public/audio/) sind öffentlich, aber verschlüsselt; Schlüssel und Inhaltsverzeichnis stehen im Tresor.

import { toB64, fromB64 } from './vault.ts';
import type { Item } from './types.ts';
import { hintFor, splitSpeech, type SpokenScript } from './voice-questions.ts';
import { speakFrench, speakGerman, type SpeechLang } from './voice.ts';
import type { Question } from './questions.ts';

export interface AudioPack {
  file: string;
  iv: string;
  size: number;
  /** Aufnahme → [Anfang, Länge] im entschlüsselten Paket. */
  clips: Record<string, [number, number]>;
}

export interface AudioManifest {
  key: string;
  packs: AudioPack[];
}

export interface Clip {
  lang: SpeechLang;
  text: string;
}

export const clipKey = (lang: SpeechLang, text: string): string => `${lang}|${text}`;

/** Satzzeichen allein werden nicht gesprochen. */
export const isSpeakable = (text: string): boolean => /\p{L}|\p{N}/u.test(text);

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Feste Sätze der App; alles Dynamische (z. B. „143 Fragen offen“) liest weiter die Systemstimme. */
export const FIXED_PHRASES: string[] = [
  'Richtig.', 'Nicht ganz. Gemeint war:', 'Gemeint war:', 'Gut, zählt als gewusst.', 'Gemeldet.', 'Pause.', 'Ende.',
  'Zurückgenommen.', 'Nichts zum Zurücknehmen.', 'Später.', 'Nicht aufgenommen.', 'Bitte sprechen.', 'Bitte auf Französisch sprechen.',
  'Welche Nummer soll raus? Oder alle behalten.', 'Alle bleiben.', 'Stimmt.', 'Falsch.', 'Bleibt so.', 'Behalten.', 'Passt.', 'Aufnehmen.',
  'Eintrag wird gestrichen.', 'Text zum Prüfen vorgemerkt.', 'Das hat nicht geklappt. Ich lasse die Frage offen.',
  ...NUMBERS.flatMap((n) => [`${n}.`, `Option ${n}.`, `Vorschlag: ${n}.`]),
];

const GROUPS: Question['group'][] = ['singles', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'];

/** Alle Aufnahmen, die die App abspielen kann, ohne Doppelte. */
export function collectClips(items: Pick<Item, 'fr' | 'de'>[], scripts: Record<string, SpokenScript>): Clip[] {
  const seen = new Map<string, Clip>();
  const add = (lang: SpeechLang, text: string) => {
    if (text && isSpeakable(text)) seen.set(clipKey(lang, text), { lang, text });
  };
  const addMixed = (text: string) => {
    for (const p of splitSpeech(text)) add(p.lang, p.text);
  };
  for (const phrase of FIXED_PHRASES) add('de-DE', phrase);
  for (const g of GROUPS) add('de-DE', `Das habe ich nicht verstanden. ${hintFor({ id: '', group: g })}`);
  for (const item of items) {
    add('fr-FR', speakFrench(item.fr));
    add('de-DE', speakGerman(item.de));
  }
  for (const s of Object.values(scripts)) for (const t of [s.kurz, s.warum, s.original, ...s.optionen]) addMixed(t);
  return [...seen.values()];
}

/** Aufnahmen zu Paketen bis `maxBytes` bündeln; die Reihenfolge bleibt erhalten. */
export function planPacks<T extends { size: number }>(clips: T[], maxBytes: number): T[][] {
  const packs: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const clip of clips) {
    if (current.length > 0 && size + clip.size > maxBytes) {
      packs.push(current);
      current = [];
      size = 0;
    }
    current.push(clip);
    size += clip.size;
  }
  if (current.length > 0) packs.push(current);
  return packs;
}

const packKey = (keyB64: string) => crypto.subtle.importKey('raw', fromB64(keyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

export function newAudioKey(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(32)));
}

export async function encryptPack(bytes: Uint8Array<ArrayBuffer>, keyB64: string): Promise<{ iv: string; data: Uint8Array<ArrayBuffer> }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: toB64(iv), data: new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await packKey(keyB64), bytes)) };
}

export async function decryptPack(data: ArrayBuffer, ivB64: string, keyB64: string): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, await packKey(keyB64), data);
}

/** Einzelne Aufnahmen aus einem entschlüsselten Paket. */
export function sliceClips(plain: ArrayBuffer, pack: AudioPack): [string, ArrayBuffer][] {
  return Object.entries(pack.clips).map(([key, [start, length]]) => [key, plain.slice(start, start + length)]);
}
