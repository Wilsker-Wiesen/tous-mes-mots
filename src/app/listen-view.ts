// Hörmodus: freihändig abfragen, z. B. im Auto. Die App liest vor, hört die Antwort, vergleicht großzügig und
// plant wie die normale Abfrage. Ohne Spracherkennung bleibt „Nur vorlesen“ (ohne Bewertung).

import type { Session, QueueEntry } from '../core/queue.ts';
import type { CardState, ReviewEvent, UndoEvent } from '../core/state.ts';
import { parseCommand, speakFrench, speakGerman, spokenMatch, type Command, type SpeechLang } from '../core/voice.ts';
import { audioPanel, type AudioDownload } from './audio-view.ts';
import { h, show } from './dom.ts';
import { beep, keepAwake, listen, say, speechSupport, stopListening, stopSpeaking, unlockAudio, type Heard } from './speech.ts';

export interface ListenInput {
  /** Neue Sitzung aus der aktuellen Warteschlange. */
  session: () => Session;
  /** Einträge für „Nur vorlesen“ (werden nicht bewertet). */
  preview: () => QueueEntry[];
  record: (state: CardState, event: ReviewEvent) => void;
  revert: (cardId: string, prev: CardState | null, undo: UndoEvent) => void;
  report: (entry: QueueEntry) => void;
  isReported: (entry: QueueEntry) => boolean;
  newId: () => string;
  appVersion: string;
  closeButton: (onclick: () => void) => HTMLElement;
  back: () => void;
  /** Sprachaufnahmen, falls veröffentlicht. */
  audio: AudioDownload | null;
  /** Gibt es gerade Vokabeln abzufragen? */
  canQuiz: () => boolean;
  /** Rückfragen zur Liste per Sprache, falls ein Katalog da ist. */
  openQuestions: (() => void) | null;
}

/** So lange wird auf eine Antwort gewartet (ms). */
const ANSWER_MS = 8000;
/** Nach einer falschen Antwort: Zeit für „doch“ (ms). */
const OVERRIDE_MS = 3500;
/** „Nur vorlesen“: Denkpause zwischen Frage und Lösung (ms). */
const READ_PAUSE_MS = 4000;

const COMMAND_HELP: [string, string][] = [
  ['„weiß nicht“', 'Lösung hören'],
  ['„nochmal“', 'Frage wiederholen'],
  ['„doch“', 'nach „Gemeint war …“: zählt als gewusst'],
  ['„zurück“', 'letzte Antwort zurücknehmen'],
  ['„melden“', 'Eintrag an die Listenpflege melden'],
  ['„Pause“ / „weiter“', 'anhalten, fortsetzen'],
  ['„Ende“', 'Sitzung beenden'],
];

function texts(entry: QueueEntry) {
  const frDe = entry.direction === 'fr-de';
  return {
    promptLang: (frDe ? 'fr-FR' : 'de-DE') as SpeechLang,
    answerLang: (frDe ? 'de-DE' : 'fr-FR') as SpeechLang,
    prompt: frDe ? speakFrench(entry.item.fr) : speakGerman(entry.item.de),
    answer: frDe ? speakGerman(entry.item.de) : speakFrench(entry.item.fr),
    answerField: frDe ? entry.item.de : entry.item.fr,
  };
}

/** Einstiegsseite: erklärt die Befehle und gibt Ton und Mikrofon per Tipp frei. */
export function listenPage(input: ListenInput): void {
  const support = speechSupport();
  const status = h('p', { class: 'small muted', role: 'status' });
  const start = async (withMic: boolean) => {
    status.textContent = 'Starte …';
    const err = await unlockAudio(withMic);
    if (err) {
      status.className = 'small err';
      status.textContent = err;
      return;
    }
    if (withMic) void run(input);
    else void readOnly(input);
  };
  show(
    h('div', { class: 'bar' }, input.closeButton(input.back), h('div', { class: 'meter' }), h('span')),
    h(
      'div',
      { class: 'listen-intro' },
      h('h2', {}, 'Hörmodus'),
      h('p', { class: 'muted' }, 'Die App liest vor und hört deine Antwort. Richtig erkannt zählt als gewusst, sonst hörst du die Lösung.'),
      !support.speak && h('p', { class: 'err' }, 'Dieser Browser kann nicht vorlesen.'),
      support.speak &&
        !support.listen &&
        h('p', { class: 'warn-text' }, 'Spracherkennung gibt es in diesem Browser nicht. „Nur vorlesen“ geht trotzdem: Frage, Pause, Lösung – ohne Bewertung.'),
      support.speak && support.listen && input.canQuiz() && h('button', { class: 'primary', textContent: 'Vokabeln abfragen', onclick: () => void start(true) }),
      support.speak && input.canQuiz() && h('button', { textContent: 'Nur vorlesen (ohne Bewertung)', onclick: () => void start(false) }),
      support.speak && support.listen && input.openQuestions && h('button', { class: 'primary', textContent: 'Rückfragen zur Liste klären', onclick: input.openQuestions }),
      status,
      input.audio && audioPanel(input.audio),
      h(
        'div',
        { class: 'panel commands' },
        h('div', { class: 'label' }, 'Sprachbefehle'),
        ...COMMAND_HELP.map(([say, what]) => h('div', { class: 'command' }, h('b', {}, say), h('span', { class: 'muted' }, what))),
        h('p', { class: 'small muted' }, 'Auch auf Französisch: „je ne sais pas“, „répète“, „retour“, „fin“. Bildschirm bleibt an; Ton über Bluetooth geht.'),
      ),
      h('p', { class: 'small muted' }, 'Im Auto nur mit Halterung und ohne Antippen.'),
    ),
  );
}

interface Screen {
  status: HTMLElement;
  word: HTMLElement;
  solution: HTMLElement;
  heard: HTMLElement;
  count: HTMLElement;
  pause: HTMLButtonElement;
}

function screen(input: ListenInput, onPause: () => void, onRepeat: () => void, onEnd: () => void): Screen {
  const s: Screen = {
    status: h('div', { class: 'listen-status', role: 'status' }),
    word: h('div', { class: 'listen-word' }),
    solution: h('div', { class: 'listen-solution' }),
    heard: h('div', { class: 'listen-heard muted small' }),
    count: h('span', { class: 'muted small' }),
    pause: h('button', { class: 'listen-big', textContent: 'Pause', onclick: onPause }),
  };
  show(
    h('div', { class: 'bar' }, input.closeButton(onEnd), h('div', { class: 'meter' }, s.count), h('span')),
    h('div', { class: 'listen' }, s.status, s.word, s.solution, s.heard),
    h('div', { class: 'listen-controls' }, s.pause, h('button', { class: 'listen-big', textContent: 'Nochmal', onclick: onRepeat })),
  );
  return s;
}

/** Abfrage mit Spracherkennung. */
async function run(input: ListenInput): Promise<void> {
  const session = input.session();
  let stopped = false;
  let paused = false;
  /** Per Knopf ausgelöster Befehl; bricht Vorlesen und Zuhören ab. */
  let pressed: Command | null = null;
  /** Gewusst ja/nein je Antwort, damit „zurück“ die Zählung mitnimmt. */
  const results: boolean[] = [];
  const release = keepAwake();

  const press = (c: Command) => {
    pressed = c;
    stopSpeaking();
    stopListening();
  };
  const ui = screen(
    input,
    () => press(paused ? 'resume' : 'pause'),
    () => press('repeat'),
    () => press('end'),
  );
  const status = (text: string, kind = '') => {
    ui.status.textContent = text;
    ui.status.dataset.kind = kind;
  };
  const counter = () => (ui.count.textContent = `${session.done} erledigt · ${session.remaining} offen`);
  const take = (): Command | null => {
    const c = pressed;
    pressed = null;
    return c;
  };

  /** Anhalten, bis „weiter“ (gesprochen oder getippt) oder „Ende“. */
  const pause = async (): Promise<'resume' | 'end'> => {
    paused = true;
    ui.pause.textContent = 'Weiter';
    status('Pause – „weiter“ sagen oder tippen', 'pause');
    await say('Pause.', 'de-DE');
    try {
      for (;;) {
        const c = take();
        if (c === 'end') return 'end';
        if (c === 'resume') return 'resume';
        const heard = await listen('de-DE', 10_000);
        const after = take();
        if (after === 'end' || after === 'resume') return after;
        if (heard.kind === 'error' && heard.error !== 'unsupported') await new Promise((r) => setTimeout(r, 1000));
        if (heard.kind === 'speech') {
          const cmd = parseCommand(heard.alts, ['resume', 'end']);
          if (cmd === 'resume' || cmd === 'end') return cmd;
        }
      }
    } finally {
      paused = false;
      ui.pause.textContent = 'Pause';
    }
  };

  type Outcome = { kind: 'answered' } | { kind: 'undo' } | { kind: 'end' } | { kind: 'error'; message: string };

  const ask = async (entry: QueueEntry): Promise<Outcome> => {
    const t = texts(entry);
    const shownAt = new Date();
    ui.word.textContent = t.prompt;
    ui.word.lang = t.promptLang.slice(0, 2);
    ui.solution.textContent = '';
    ui.heard.textContent = '';
    let silences = 0;
    let said = '';
    let match: string | null = null;

    for (;;) {
      status('…', 'speak');
      await say(t.prompt, t.promptLang);
      let heard: Heard = { kind: 'silence' };
      if (!pressed) {
        await beep();
        status('Ich höre zu', 'listen');
        heard = await listen(t.answerLang, ANSWER_MS);
      }
      // Navigation o. ä. hat dazwischengesprochen: Frage noch einmal, ohne zu werten.
      if (heard.kind === 'interrupted' && !pressed) continue;
      const cmd =
        take() ??
        (heard.kind === 'speech' ? ((match = spokenMatch(heard.alts, t.answerField, t.answerLang)) ? null : parseCommand(heard.alts, ['dontknow', 'repeat', 'undo', 'pause', 'end', 'report'])) : null);
      if (heard.kind === 'error') return { kind: 'error', message: heard.error === 'not-allowed' || heard.error === 'service-not-allowed' ? 'Kein Zugriff auf Mikrofon oder Spracherkennung.' : `Spracherkennung: ${heard.error}` };
      if (cmd === 'end') return { kind: 'end' };
      if (cmd === 'undo') return { kind: 'undo' };
      if (cmd === 'repeat') continue;
      if (cmd === 'pause' || cmd === 'resume') {
        if ((await pause()) === 'end') return { kind: 'end' };
        continue;
      }
      if (cmd === 'report') {
        if (!input.isReported(entry)) input.report(entry);
        await say('Gemeldet.', 'de-DE');
        continue;
      }
      if (heard.kind === 'silence' && cmd !== 'dontknow') {
        if (++silences < 2) continue;
      }
      if (heard.kind === 'speech') {
        said = match ?? (cmd === 'dontknow' ? '' : (heard.alts[0] ?? ''));
        ui.heard.textContent = said ? `Gehört: „${said}“` : '';
      }
      break;
    }

    const revealedAt = new Date();
    let isKnown = match !== null;
    ui.solution.textContent = t.answer;
    ui.solution.lang = t.answerLang.slice(0, 2);
    if (isKnown) {
      status('Richtig', 'ok');
      await say('Richtig.', 'de-DE');
    } else {
      status(said ? 'Nicht ganz' : 'Lösung', 'no');
      await say(said ? 'Nicht ganz. Gemeint war:' : 'Gemeint war:', 'de-DE');
      await say(t.answer, t.answerLang);
      // Erkennung kann sich verhören: „doch“ zählt die Karte als gewusst.
      if (!pressed && said) {
        status('„doch“, falls es gestimmt hat', 'listen');
        await beep('low');
        const heard = await listen('de-DE', OVERRIDE_MS);
        const cmd = take() ?? (heard.kind === 'speech' ? parseCommand(heard.alts, ['yes', 'end', 'pause']) : null);
        if (cmd === 'yes') {
          isKnown = true;
          status('Zählt als gewusst', 'ok');
          await say('Gut, zählt als gewusst.', 'de-DE');
        } else if (cmd === 'end') {
          record(false, said, shownAt, revealedAt);
          return { kind: 'end' };
        } else if (cmd === 'pause') {
          record(false, said, shownAt, revealedAt);
          return (await pause()) === 'end' ? { kind: 'end' } : { kind: 'answered' };
        }
      }
    }
    record(isKnown, said, shownAt, revealedAt, match !== null);
    return { kind: 'answered' };
  };

  const record = (isKnown: boolean, said: string, shownAt: Date, revealedAt: Date, matched = false) => {
    const { state, event } = session.answer({
      known: isKnown,
      now: new Date(),
      shownAt,
      revealedAt,
      appVersion: input.appVersion,
      typed: { answer: said, match: matched },
      spoken: true,
    });
    results.push(isKnown);
    input.record(state, event);
  };

  let error: string | null = null;
  try {
    let entry = session.next(new Date());
    while (entry && !stopped) {
      counter();
      const out = await ask(entry);
      if (out.kind === 'end') break;
      if (out.kind === 'error') {
        error = out.message;
        break;
      }
      if (out.kind === 'undo') {
        const u = session.undo();
        if (u) {
          input.revert(u.cardId, u.prev, { kind: 'undo', id: input.newId(), ts: new Date().toISOString(), targetId: u.eventId });
          results.pop();
          await say('Zurückgenommen.', 'de-DE');
          entry = session.current;
        } else {
          await say('Nichts zum Zurücknehmen.', 'de-DE');
        }
        continue;
      }
      entry = session.next(new Date());
    }
  } finally {
    stopped = true;
    stopListening();
    release();
  }
  const done = session.done;
  const known = results.filter(Boolean).length;
  stopSpeaking();
  if (!error) void say(done === 0 ? 'Ende.' : `Fertig. ${done} ${done === 1 ? 'Karte' : 'Karten'}, davon ${known} gewusst.`, 'de-DE');
  show(
    h(
      'div',
      { class: 'end' },
      error && h('p', { class: 'err' }, error),
      h('div', { class: 'panel' }, h('b', {}, String(done)), h('p', { class: 'muted' }, `${done === 1 ? 'Karte' : 'Karten'} · ${known} gewusst`)),
      h('button', { class: 'primary', textContent: 'Nochmal starten', onclick: () => listenPage(input) }),
      h('button', { textContent: 'Zur Übersicht', onclick: () => (stopSpeaking(), input.back()) }),
    ),
  );
}

/** Nur vorlesen: Frage, Denkpause, Lösung. Keine Erkennung, keine Bewertung. */
async function readOnly(input: ListenInput): Promise<void> {
  const entries = input.preview();
  let stopped = false;
  let paused = false;
  let wake: (() => void) | null = null;
  let skipBack = false;
  const release = keepAwake();
  const ui = screen(
    input,
    () => {
      paused = !paused;
      ui.pause.textContent = paused ? 'Weiter' : 'Pause';
      if (paused) stopSpeaking();
      else wake?.();
    },
    () => {
      skipBack = true;
      stopSpeaking();
      wake?.();
    },
    () => {
      stopped = true;
      stopSpeaking();
      wake?.();
    },
  );
  const wait = (ms: number) =>
    new Promise<void>((done) => {
      const t = setTimeout(done, ms);
      wake = () => (clearTimeout(t), done());
    });
  const untilResumed = async () => {
    while (paused && !stopped) await wait(60_000);
  };

  for (let i = 0; i < entries.length && !stopped; i++) {
    const t = texts(entries[i]!);
    ui.count.textContent = `${i + 1} von ${entries.length}`;
    ui.word.textContent = t.prompt;
    ui.solution.textContent = '';
    ui.status.textContent = '';
    skipBack = false;
    await say(t.prompt, t.promptLang);
    await untilResumed();
    if (!skipBack && !stopped) await wait(READ_PAUSE_MS);
    await untilResumed();
    if (skipBack) {
      i--;
      continue;
    }
    if (stopped) break;
    ui.solution.textContent = t.answer;
    await say(t.answer, t.answerLang);
    await untilResumed();
    if (skipBack) {
      i--;
      continue;
    }
    if (!stopped) await wait(1200);
  }
  release();
  stopSpeaking();
  input.back();
}
