import { describe, expect, it } from 'vitest';
import { decryptVault, deriveKey, encryptVault, exportKey, fromB64, importKey, keyForVault, toB64, WrongPasswordError, type VaultPayload } from './vault.ts';

// Wenige Iterationen nur im Test, damit er schnell bleibt; die App nutzt PBKDF2_ITERATIONS.
const ITER = 1000;
const payload: VaultPayload = {
  cards: { schemaVersion: 1, generatedAt: '2026-10-31T00:00:00Z', source: { file: 'x.csv', sha1: 'abc', rows: 1 }, items: [], orphans: [] },
  rueckfragen: { katalog: { stand: '2026-10-31', gruppen: {}, fragen: {} }, antworten: {}, bilder: { 'r001.jpg': 'data:image/jpeg;base64,AAAA' } },
};

describe('Tresor', () => {
  it('verschlüsselt und entschlüsselt verlustfrei; der Klartext steht nicht in der Datei', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey('richtig', salt, ITER);
    const vault = await encryptVault(payload, key, salt, ITER);
    expect(JSON.stringify(vault)).not.toContain('x.csv');
    expect(await decryptVault(vault, await keyForVault(vault, 'richtig'))).toEqual(payload);
  });

  it('falsches Passwort wird erkannt', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const vault = await encryptVault(payload, await deriveKey('richtig', salt, ITER), salt, ITER);
    await expect(decryptVault(vault, await keyForVault(vault, 'falsch'))).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('gleicher Salt → gespeicherter Schlüssel passt auch für einen neuen Stand', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey('richtig', salt, ITER);
    const stored = await exportKey(key);
    const v2 = await encryptVault({ ...payload, cards: { ...payload.cards, generatedAt: '2026-11-05T00:00:00Z' } }, key, salt, ITER);
    expect((await decryptVault(v2, await importKey(stored))).cards.generatedAt).toBe('2026-11-05T00:00:00Z');
  });

  it('jede Verschlüsselung nutzt einen neuen IV', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey('richtig', salt, ITER);
    const a = await encryptVault(payload, key, salt, ITER);
    const b = await encryptVault(payload, key, salt, ITER);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
  });

  it('Base64 auch für große Daten', () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 7919) % 256);
    expect(fromB64(toB64(big))).toEqual(big);
  });
});
