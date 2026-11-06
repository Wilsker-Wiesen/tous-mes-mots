// Tresor: Wortliste, Rückfragenkatalog und Bilder als eine verschlüsselte Datei im öffentlichen Repo.
// AES-256-GCM, Schlüssel per PBKDF2-SHA-256 aus Jans Passwort. Läuft im Browser und in Node (Web Crypto).
// Auf dem Gerät wird nur der abgeleitete Schlüssel gespeichert, nie das Passwort.

import type { AudioManifest } from './audio.ts';
import type { Answer, Catalog } from './questions.ts';
import type { CardsFile } from './types.ts';
import type { SpokenScript } from './voice-questions.ts';

export const VAULT_FORMAT = 'tous-mes-mots-tresor';
export const VAULT_VERSION = 1;
/** OWASP-Empfehlung für PBKDF2-SHA-256 (2023). Auf dem iPhone etwa eine Sekunde, einmal pro Gerät. */
export const PBKDF2_ITERATIONS = 600_000;

export interface VaultPayload {
  cards: CardsFile;
  /** Inhaltsverzeichnis und Schlüssel der Sprachaufnahmen (public/audio/). */
  audio?: AudioManifest;
  rueckfragen?: {
    katalog: Catalog;
    antworten: Record<string, Partial<Answer> & { id: string }>;
    /** Dateiname (z. B. „r001.jpg“) → data:-URL. */
    bilder: Record<string, string>;
    /** Sprechtexte für den Hörmodus, Schlüssel = Frage-id. */
    sprechtexte?: Record<string, SpokenScript>;
  };
}

export interface Vault {
  format: typeof VAULT_FORMAT;
  version: number;
  created: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return toB64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/**
 * Verschlüsseln. `salt` übergeben, um den Salt eines bestehenden Tresors beizubehalten: Dann passt der auf den
 * Geräten gespeicherte Schlüssel weiter und niemand muss sich nach einer neuen Wortliste erneut anmelden.
 */
export async function encryptVault(payload: VaultPayload, key: CryptoKey, salt: Uint8Array, iterations = PBKDF2_ITERATIONS, now = new Date()): Promise<Vault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await pipe(enc.encode(JSON.stringify(payload)), new CompressionStream('gzip'));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed));
  return {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    created: now.toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(cipher),
  };
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Das Passwort stimmt nicht.');
  }
}

/** Entschlüsseln; ein falscher Schlüssel fällt an der GCM-Prüfsumme auf. */
export async function decryptVault(vault: Vault, key: CryptoKey): Promise<VaultPayload> {
  if (vault.format !== VAULT_FORMAT || vault.version > VAULT_VERSION) throw new Error('Unbekanntes Tresorformat.');
  let plain: Uint8Array<ArrayBuffer>;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.cipher.iv) }, key, fromB64(vault.data)));
  } catch {
    throw new WrongPasswordError();
  }
  return JSON.parse(dec.decode(await pipe(plain, new DecompressionStream('gzip')))) as VaultPayload;
}

/** Schlüssel zu einem Tresor aus dem Passwort (nutzt Salt und Iterationen aus der Datei). */
export function keyForVault(vault: Vault, password: string): Promise<CryptoKey> {
  return deriveKey(password, fromB64(vault.kdf.salt), vault.kdf.iterations);
}
