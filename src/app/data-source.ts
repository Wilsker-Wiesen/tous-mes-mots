// Woher die Wortliste kommt: online aus dem verschlüsselten Tresor (public/vault.json im Repo),
// in der Entwicklung ohne Tresor direkt aus public/data/.

import { questionsFrom } from '../core/questions.ts';
import type { CardsFile } from '../core/types.ts';
import { decryptVault, exportKey, importKey, keyForVault, WrongPasswordError, type Vault, type VaultPayload } from '../core/vault.ts';
import type { Store } from '../storage/db.ts';
import { h, show } from './dom.ts';
import { loadQuestions, type QuestionsData } from './questions-view.ts';

const KEY_META = 'vault:key';

export interface AppData {
  file: CardsFile;
  questions: QuestionsData | null;
}

function tiles(text: string): HTMLElement {
  return h(
    'h1',
    { class: 'tiles', ariaLabel: text },
    ...text
      .toUpperCase()
      .split(' ')
      .map((w) => h('span', { class: 'word', ariaHidden: 'true' }, ...[...w].map((c, i) => h('span', { class: i === 0 ? 'tile first' : 'tile' }, c)))),
  );
}

/** Anmeldeseite: einmal pro Gerät. Liefert den passenden Schlüssel, sobald das Passwort stimmt. */
function unlock(vault: Vault): Promise<CryptoKey> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', placeholder: 'Passwort', autocomplete: 'current-password', required: true, ariaLabel: 'Passwort' });
    const status = h('p', { class: 'small muted', role: 'status' }, 'Einmal pro Gerät. Danach startet die App ohne Passwort, auch offline.');
    const button = h('button', { class: 'primary', type: 'submit', textContent: 'Entsperren' });
    const submit = async (ev: Event) => {
      ev.preventDefault();
      if (!input.value) return;
      button.disabled = true;
      status.className = 'small muted';
      status.textContent = 'Entschlüssele …';
      const key = await keyForVault(vault, input.value);
      try {
        await decryptVault(vault, key);
        resolve(key);
      } catch (err) {
        button.disabled = false;
        status.className = 'small err';
        status.textContent = err instanceof WrongPasswordError ? err.message : String(err);
        input.select();
      }
    };
    show(
      h(
        'form',
        { class: 'home unlock', onsubmit: (ev: Event) => void submit(ev) },
        h('div', { class: 'brand' }, tiles('Tous mes mots'), h('p', { class: 'muted small' }, 'Persönlicher Vokabeltrainer')),
        input,
        button,
        status,
      ),
    );
    input.focus();
  });
}

function questionsFromPayload(p: NonNullable<VaultPayload['rueckfragen']>): QuestionsData {
  return {
    catalog: p.katalog,
    questions: questionsFrom(p.katalog),
    previous: p.antworten,
    image: (bild) => p.bilder[bild.split('/').pop() ?? ''] ?? '',
  };
}

async function fromVault(vault: Vault, store: Store): Promise<AppData> {
  const saved = await store.getMeta<{ salt: string; key: string }>(KEY_META);
  let payload: VaultPayload | null = null;
  if (saved && saved.salt === vault.kdf.salt) {
    try {
      payload = await decryptVault(vault, await importKey(saved.key));
    } catch {
      payload = null; // z. B. neues Passwort gesetzt: einmal neu anmelden
    }
  }
  if (!payload) {
    const key = await unlock(vault);
    payload = await decryptVault(vault, key);
    await store.setMeta(KEY_META, { salt: vault.kdf.salt, key: await exportKey(key) });
  }
  return { file: payload.cards, questions: payload.rueckfragen ? questionsFromPayload(payload.rueckfragen) : null };
}

/** Lädt Wortliste und Rückfragen; null, wenn es keine Daten gibt. */
export async function loadAppData(store: Store): Promise<AppData | null> {
  const res = await fetch('./vault.json', { cache: 'no-cache' }).catch(() => null);
  if (res?.ok) return fromVault((await res.json()) as Vault, store);
  // Entwicklung ohne Tresor: Klartextdateien aus npm run import / npm run rueckfragen.
  const plain = await fetch('./data/cards.json', { cache: 'no-cache' }).catch(() => null);
  if (!plain?.ok) return null;
  return { file: (await plain.json()) as CardsFile, questions: await loadQuestions() };
}

/** Gespeicherten Schlüssel löschen (Abmelden auf diesem Gerät). */
export async function forgetKey(store: Store): Promise<void> {
  await store.setMeta(KEY_META, null);
}
