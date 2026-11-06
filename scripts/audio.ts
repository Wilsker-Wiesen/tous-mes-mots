// Sprachaufnahmen auf diesem Mac erzeugen und verschlüsselt packen. Läuft lange und lässt sich jederzeit fortsetzen.
//   npm run audio                  # alles Fehlende erzeugen, dann packen
//   npm run audio -- --limit=20    # nur 20 Aufnahmen (Probe)
//   npm run audio -- --nur-packen
//   npm run audio -- --modell=normal  # kleinere, schnellere Modelle statt der 24-Schichten-Modelle
// Veröffentlicht wird mit npm run daten. Rohaufnahmen und Inhaltsverzeichnis bleiben in private/audio/.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clipKey, collectClips, encryptPack, newAudioKey, planPacks, type AudioManifest, type AudioPack, type Clip } from '../src/core/audio.ts';
import type { CardsFile } from '../src/core/types.ts';
import type { SpokenScript } from '../src/core/voice-questions.ts';
import type { SpeechLang } from '../src/core/voice.ts';

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const engine = option('engine') ?? 'pocket';
const limit = Number(option('limit') ?? Infinity);
const parallel = Number(option('parallel') ?? 2);
const model = option('modell') ?? '24l';
const ROOT = resolve(option('out') ?? 'private/audio');
const PUBLIC = resolve(option('public') ?? 'public/audio');
const CLIPS = join(ROOT, 'clips');
const MANIFEST = join(ROOT, 'manifest.json');
const PACK_BYTES = 20 * 1024 * 1024;

const VOICES: Record<SpeechLang, { language: string; voice: string; base: number }> = {
  'fr-FR': { language: model === '24l' ? 'french_24l' : 'french', voice: 'estelle', base: 8100 },
  'de-DE': { language: model === '24l' ? 'german_24l' : 'german', voice: 'juergen', base: 8200 },
};

const clipFile = (c: Clip) => join(CLIPS, `${createHash('sha1').update(clipKey(c.lang, c.text)).digest('hex')}.m4a`);

function readClips(): Clip[] {
  const cards = JSON.parse(readFileSync('public/data/cards.json', 'utf8')) as CardsFile;
  const path = 'private/rueckfragen/sprechtexte.json';
  const scripts = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, SpokenScript>) : {};
  return collectClips(cards.items, scripts);
}

function toAac(input: string, output: string): void {
  try {
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '32000', '-c', '1', input, output], { stdio: 'ignore' });
  } catch {
    // Gestreamte WAV-Dateien haben keine gültige Längenangabe; ffmpeg kommt damit zurecht.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'wav', '-i', input, '-ac', '1', '-c:a', 'aac', '-b:a', '32k', '-f', 'mp4', output]);
  }
}

// --- Pocket TTS: je Sprache und Arbeiter ein Server, damit das Modell im Speicher bleibt. ---

function pocketBinary(): string {
  const dir = resolve('private/tts');
  const found = existsSync(dir) ? readdirSync(dir).find((d) => d.startsWith('pocket-tts-') && existsSync(join(dir, d, 'pocket-tts'))) : undefined;
  if (!found) throw new Error('Pocket TTS fehlt in private/tts/. Zuerst: npm run stimme');
  return join(dir, found, 'pocket-tts');
}

/** Server starten und warten, bis er antwortet. Beim ersten Start lädt er das Modell herunter. */
async function startServer(bin: string, args: string[], port: number): Promise<ChildProcess> {
  const log = join(resolve('private/tts'), `server-${port}.log`);
  const server = spawn(bin, [...args, '--port', String(port)], { stdio: ['ignore', openSync(log, 'w'), openSync(log, 'a')] });
  let exited = false;
  server.on('exit', () => (exited = true));
  for (let i = 0; i < 1800 && !exited; i++) {
    const ok = await fetch(`http://localhost:${port}/health`).then((r) => r.ok, () => false);
    if (ok) return server;
    await new Promise((r) => setTimeout(r, 1000));
  }
  server.kill();
  throw new Error(`Server auf Port ${port} ${exited ? 'ist abgestürzt' : 'antwortet nicht'}. Protokoll: ${log}`);
}

async function pocketWav(text: string, port: number, wav: string): Promise<void> {
  const form = new FormData();
  form.set('text', text);
  const res = await fetch(`http://localhost:${port}/tts`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Pocket TTS: ${res.status} ${await res.text()}`);
  writeFileSync(wav, new Uint8Array(await res.arrayBuffer()));
}

// --- Erzeugen ---

async function generate(): Promise<void> {
  const clips = readClips();
  const open = clips.filter((c) => !existsSync(clipFile(c)));
  const openChars = open.reduce((a, c) => a + c.text.length, 0);
  // Probe: beide Sprachen, von den Vokabeln statt nur den festen Sätzen am Anfang der Liste.
  const sample = (lang: SpeechLang) => open.filter((c) => c.lang === lang).reverse().slice(0, Math.ceil(limit / 2));
  const missing = Number.isFinite(limit) ? [...sample('fr-FR'), ...sample('de-DE')] : open;
  console.log(`${clips.length} Aufnahmen insgesamt, ${missing.length} werden jetzt erzeugt (${missing.reduce((a, c) => a + c.text.length, 0)} Zeichen).`);
  if (missing.length === 0) return;
  mkdirSync(CLIPS, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'tmm-audio-'));
  const servers: ChildProcess[] = [];
  const stop = () => servers.forEach((s) => s.kill());
  process.on('SIGINT', () => (stop(), process.exit(130)));

  type Worker = { lang: SpeechLang; port: number };
  const workers: Worker[] = [];
  const start = Date.now();
  let done = 0;
  let chars = 0;
  const total = missing.reduce((a, c) => a + c.text.length, 0);
  try {
    if (engine === 'pocket') {
      const bin = pocketBinary();
      console.log('Warte auf die Modelle (beim ersten Mal werden sie heruntergeladen) …');
      for (const lang of ['fr-FR', 'de-DE'] as SpeechLang[]) {
        if (!missing.some((c) => c.lang === lang)) continue;
        const v = VOICES[lang];
        for (let i = 0; i < parallel; i++) {
          const port = v.base + i;
          // Nacheinander: Gleichzeitig gestartete Server stören sich beim Laden des Modells.
          servers.push(await startServer(bin, ['serve', '--language', v.language, '--default-voice', v.voice], port));
          workers.push({ lang, port });
        }
      }
    } else {
      // Nur zum Testen der Abläufe: Systemstimme statt Pocket TTS.
      workers.push({ lang: 'fr-FR', port: 0 }, { lang: 'de-DE', port: 0 });
    }

    const queues: Record<SpeechLang, Clip[]> = { 'fr-FR': missing.filter((c) => c.lang === 'fr-FR'), 'de-DE': missing.filter((c) => c.lang === 'de-DE') };
    await Promise.all(
      workers.map(async (w, n) => {
        for (let clip = queues[w.lang].shift(); clip; clip = queues[w.lang].shift()) {
          const base = join(tmp, `${n}`);
          const target = clipFile(clip);
          if (engine === 'pocket') {
            await pocketWav(clip.text, w.port, `${base}.wav`);
            toAac(`${base}.wav`, `${base}.m4a`);
          } else {
            execFileSync('say', ['-o', `${base}.aiff`, '--', clip.text]);
            toAac(`${base}.aiff`, `${base}.m4a`);
          }
          renameSync(`${base}.m4a`, target);
          done++;
          chars += clip.text.length;
          if (done % 25 === 0 || done === missing.length) {
            const secs = (Date.now() - start) / 1000;
            const left = (secs / chars) * (total - chars);
            console.log(`${done}/${missing.length} · ${Math.round(secs / 60)} min vergangen · noch etwa ${Math.round(left / 60)} min`);
          }
        }
      }),
    );
    if (Number.isFinite(limit)) {
      const hours = ((Date.now() - start) / 3_600_000 / chars) * (openChars - chars);
      console.log(`Probe fertig: private/audio/clips/. Der Rest dauert in diesem Tempo etwa ${hours.toFixed(1)} Stunden.`);
    }
  } finally {
    stop();
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- Packen: Vorhandene Pakete bleiben unverändert, Neues kommt in neue Pakete (hält die Git-Historie klein). ---

async function pack(): Promise<void> {
  const clips = readClips();
  mkdirSync(PUBLIC, { recursive: true });
  const manifest: AudioManifest = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as AudioManifest) : { key: newAudioKey(), packs: [] };
  const packed = new Set(manifest.packs.flatMap((p) => Object.keys(p.clips)));
  const fresh = clips.filter((c) => !packed.has(clipKey(c.lang, c.text)) && existsSync(clipFile(c))).map((c) => ({ ...c, size: statSync(clipFile(c)).size }));
  const absent = clips.filter((c) => !packed.has(clipKey(c.lang, c.text)) && !existsSync(clipFile(c))).length;
  for (const group of planPacks(fresh, PACK_BYTES)) {
    const buffer = new Uint8Array(group.reduce((a, c) => a + c.size, 0));
    const index: AudioPack['clips'] = {};
    let at = 0;
    for (const clip of group) {
      buffer.set(readFileSync(clipFile(clip)), at);
      index[clipKey(clip.lang, clip.text)] = [at, clip.size];
      at += clip.size;
    }
    const { iv, data } = await encryptPack(buffer, manifest.key);
    const file = `p${String(manifest.packs.length).padStart(3, '0')}.bin`;
    writeFileSync(join(PUBLIC, file), data);
    manifest.packs.push({ file, iv, size: data.length, clips: index });
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest));
  // Entwicklung ohne Tresor liest das Verzeichnis im Klartext (public/data/ ist gitignoriert).
  if (!option('out') && existsSync('public/data')) writeFileSync('public/data/audio.json', JSON.stringify(manifest));
  const mb = manifest.packs.reduce((a, p) => a + p.size, 0) / 1024 / 1024;
  console.log(`${manifest.packs.length} Pakete, ${Math.round(mb)} MB, ${fresh.length} neu gepackt${absent > 0 ? `, ${absent} Aufnahmen fehlen noch` : ''}.`);
  console.log('Veröffentlichen: npm run daten');
}

async function main() {
  if (!args.includes('--nur-packen')) await generate();
  // Eine Probe wird nicht gepackt: Pakete bleiben unverändert, und die Stimme soll noch wechseln können.
  if (!Number.isFinite(limit)) await pack();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
