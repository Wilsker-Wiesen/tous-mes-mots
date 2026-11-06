import { describe, expect, it } from 'vitest';
import { clipKey, collectClips, decryptPack, encryptPack, FIXED_PHRASES, newAudioKey, planPacks, sliceClips, type AudioPack } from './audio.ts';

describe('Aufnahmen sammeln', () => {
  const clips = collectClips([{ fr: 'chat (m)', de: 'Katze; Kater' }, { fr: 'chat (m)', de: 'Katze; Kater' }], {
    a1: { kurz: 'Steht da {le chat}?', warum: 'Unklar.', original: '{le chat}', optionen: ['{le chat}, Katze'] },
  });
  const keys = clips.map((c) => clipKey(c.lang, c.text));

  it('Vokabeln und Sprechtexte, je Sprache, ohne Doppelte', () => {
    expect(keys).toContain('fr-FR|chat');
    expect(keys).toContain('de-DE|Katze; Kater');
    expect(keys).toContain('de-DE|Steht da');
    expect(keys.filter((k) => k === 'fr-FR|le chat')).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Satzzeichen allein werden übersprungen, feste Sätze sind dabei', () => {
    expect(keys).not.toContain('de-DE|?');
    for (const phrase of FIXED_PHRASES) expect(keys).toContain(`de-DE|${phrase}`);
  });
});

describe('Pakete', () => {
  it('bündelt bis zur Höchstgröße, auch übergroße Einzelstücke bleiben erhalten', () => {
    const sized = [5, 5, 5, 20, 1].map((size) => ({ size }));
    expect(planPacks(sized, 10).map((p) => p.map((c) => c.size))).toEqual([[5, 5], [5], [20], [1]]);
  });

  it('verschlüsselt verlustfrei und zerlegt wieder in Aufnahmen', async () => {
    const key = newAudioKey();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const { iv, data } = await encryptPack(bytes, key);
    expect([...data.slice(0, 5)]).not.toEqual([1, 2, 3, 4, 5]);
    const plain = await decryptPack(data.buffer, iv, key);
    const pack: AudioPack = { file: 'p', iv, size: data.length, clips: { a: [0, 2], b: [2, 3] } };
    expect(sliceClips(plain, pack).map(([k, v]) => [k, [...new Uint8Array(v)]])).toEqual([['a', [1, 2]], ['b', [3, 4, 5]]]);
  });

  it('falscher Schlüssel schlägt fehl', async () => {
    const { iv, data } = await encryptPack(new Uint8Array([1]), newAudioKey());
    await expect(decryptPack(data.buffer, iv, newAudioKey())).rejects.toBeDefined();
  });
});
