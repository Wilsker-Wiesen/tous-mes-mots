// Sprachausgabe und Spracherkennung des Browsers (Web Speech API), alles auf dem Gerät bzw. über die
// Diktierfunktion des Systems. Kein eigener Server.

import { splitSpeech } from '../core/voice-questions.ts';
import type { SpeechLang } from '../core/voice.ts';

/** Ergebnis eines Zuhörens. */
export type Heard = { kind: 'speech'; alts: string[] } | { kind: 'silence' } | { kind: 'error'; error: string };

// Die Erkennung heißt in Safari noch webkitSpeechRecognition; eigene Mindesttypen, weil lib.dom sie nicht überall kennt.
interface RecognitionResultList {
  length: number;
  [i: number]: { length: number; [j: number]: { transcript: string } };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: RecognitionResultList }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupport(): { speak: boolean; listen: boolean } {
  return { speak: 'speechSynthesis' in window, listen: recognitionCtor() !== null };
}

let voices: SpeechSynthesisVoice[] = [];
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  voices = speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise((done) => {
    const finish = () => done((voices = speechSynthesis.getVoices()));
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    setTimeout(finish, 1500);
  });
}

/** Beste Stimme für die Sprache: Premium vor Erweitert vor lokal. */
export function bestVoice(lang: SpeechLang): SpeechSynthesisVoice | null {
  const base = lang.slice(0, 2);
  const candidates = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
  const score = (v: SpeechSynthesisVoice) =>
    (/premium/iu.test(v.name) ? 8 : 0) +
    (/enhanced|erweitert|améliorée/iu.test(v.name) ? 4 : 0) +
    (v.lang.replace('_', '-') === lang ? 2 : 0) +
    (v.localService ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Hält die laufende Äußerung fest; Safari bricht sonst gelegentlich ab, wenn sie eingesammelt wird. */
let current: SpeechSynthesisUtterance | null = null;

/** Vorlesen; endet, wenn fertig gesprochen oder abgebrochen. */
export function say(text: string, lang: SpeechLang, rate = 0.95): Promise<void> {
  if (!text) return Promise.resolve();
  return new Promise((done) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = bestVoice(lang);
    if (v) u.voice = v;
    u.onend = u.onerror = () => {
      if (current === u) current = null;
      done();
    };
    current = u;
    speechSynthesis.speak(u);
  });
}

/** Sprechtext mit {französischen} Stellen; `stop` bricht zwischen den Teilen ab. */
export async function sayMixed(text: string, stop: () => boolean = () => false): Promise<void> {
  for (const part of splitSpeech(text)) {
    if (stop()) return;
    if (/\p{L}|\p{N}/u.test(part.text)) await say(part.text, part.lang);
  }
}

export function stopSpeaking(): void {
  speechSynthesis.cancel();
}

let activeRecognition: Recognition | null = null;

/** Einmal zuhören: bis zur ersten erkannten Äußerung, zur Stille oder bis `ms` vergangen sind. */
export function listen(lang: SpeechLang, ms: number): Promise<Heard> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.resolve({ kind: 'error', error: 'unsupported' });
  return new Promise((done) => {
    const r = new Ctor();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 3;
    let result: Heard = { kind: 'silence' };
    r.onresult = (ev) => {
      const alts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const res = ev.results[i]!;
        for (let j = 0; j < res.length; j++) alts.push(res[j]!.transcript.trim());
      }
      if (alts.some((a) => a)) result = { kind: 'speech', alts: alts.filter((a) => a) };
    };
    r.onerror = (ev) => {
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') result = { kind: 'error', error: ev.error };
    };
    const timer = setTimeout(() => r.abort(), ms);
    r.onend = () => {
      clearTimeout(timer);
      if (activeRecognition === r) activeRecognition = null;
      done(result);
    };
    activeRecognition = r;
    try {
      r.start();
    } catch (err) {
      clearTimeout(timer);
      done({ kind: 'error', error: String(err) });
    }
  });
}

export function stopListening(): void {
  activeRecognition?.abort();
}

let audio: AudioContext | null = null;

/** Kurzer Ton: „jetzt sprechen“ (hoch) oder Hinweis (tief). */
export function beep(kind: 'listen' | 'low' = 'listen'): Promise<void> {
  if (!audio) return Promise.resolve();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = kind === 'listen' ? 880 : 440;
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.15);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.16);
  return new Promise((done) => (osc.onended = () => done()));
}

/**
 * Muss aus einem Tipp heraus aufgerufen werden: iOS gibt Sprachausgabe, Töne und Mikrofon nur nach einer
 * Nutzeraktion frei. Liefert eine Fehlermeldung, wenn das Mikrofon verweigert wurde.
 */
export async function unlockAudio(withMic: boolean): Promise<string | null> {
  speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
  try {
    audio ??= new AudioContext();
    await audio.resume();
  } catch {
    audio = null;
  }
  await loadVoices();
  if (!withMic || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of stream.getTracks()) t.stop();
    return null;
  } catch {
    return 'Kein Zugriff aufs Mikrofon. In den Einstellungen für diese App bzw. Safari erlauben.';
  }
}

/** Bildschirm wach halten, solange der Hörmodus läuft. */
export function keepAwake(): () => void {
  let lock: WakeLockSentinel | null = null;
  let on = true;
  const request = () => {
    if (on && document.visibilityState === 'visible') navigator.wakeLock?.request('screen').then((l) => (lock = l), () => {});
  };
  document.addEventListener('visibilitychange', request);
  request();
  return () => {
    on = false;
    document.removeEventListener('visibilitychange', request);
    void lock?.release();
  };
}
