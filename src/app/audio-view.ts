// Sprachaufnahmen einmal aufs Gerät laden; danach laufen sie offline. Fehlt eine Aufnahme, liest die Systemstimme.

import { decryptPack, sliceClips, type AudioManifest } from '../core/audio.ts';
import type { Store } from '../storage/db.ts';
import { h } from './dom.ts';

const LOADED_META = 'audio:pakete';

export interface AudioDownload {
  manifest: AudioManifest;
  store: Store;
}

/** Ein Paket nach dem anderen; ein Abbruch verliert nur das laufende. */
export async function downloadAudio({ manifest, store }: AudioDownload, progress: (doneBytes: number, totalBytes: number) => void): Promise<void> {
  const loaded = new Set((await store.getMeta<string[]>(LOADED_META)) ?? []);
  const open = manifest.packs.filter((p) => !loaded.has(p.file));
  const total = open.reduce((a, p) => a + p.size, 0);
  let done = 0;
  progress(0, total);
  for (const pack of open) {
    const res = await fetch(`./audio/${pack.file}`);
    if (!res.ok) throw new Error(`${pack.file}: ${res.status}`);
    const plain = await decryptPack(await res.arrayBuffer(), pack.iv, manifest.key);
    await store.putClips(sliceClips(plain, pack));
    loaded.add(pack.file);
    await store.setMeta(LOADED_META, [...loaded]);
    done += pack.size;
    progress(done, total);
  }
}

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

export function audioPanel(input: AudioDownload): HTMLElement {
  const panel = h('div', { class: 'panel commands' });
  const render = async () => {
    const loaded = new Set((await input.store.getMeta<string[]>(LOADED_META)) ?? []);
    const open = input.manifest.packs.filter((p) => !loaded.has(p.file));
    const size = open.reduce((a, p) => a + p.size, 0);
    const label = h('div', { class: 'label' }, 'Natürliche Stimme');
    if (open.length === 0) {
      panel.replaceChildren(label, h('p', { class: 'small muted' }, 'Auf diesem Gerät geladen, läuft offline.'));
      return;
    }
    const status = h('p', { class: 'small muted', role: 'status' }, `Einmal laden, am besten im WLAN (${mb(size)}). Danach offline. Bis dahin liest die Stimme des iPhones.`);
    const button = h('button', { textContent: loaded.size > 0 ? 'Weiter laden' : 'Stimme laden' });
    button.onclick = async () => {
      button.disabled = true;
      try {
        await downloadAudio(input, (done, total) => (status.textContent = `Lade … ${mb(done)} von ${mb(total)}. App dabei geöffnet lassen.`));
        await render();
      } catch (err) {
        console.error(err);
        button.disabled = false;
        status.className = 'small err';
        status.textContent = 'Laden unterbrochen. Tippe auf „Stimme laden“, es geht dort weiter.';
      }
    };
    panel.replaceChildren(label, status, button);
  };
  void render();
  return panel;
}
