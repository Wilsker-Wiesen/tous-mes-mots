// Rückfragen zur Liste per Sprache: Die App liest Frage und Optionen vor, erklärt auf Nachfrage das Problem und nimmt
// die Entscheidung entgegen. Mit eigenem Schlüssel geht Unerkanntes als freies Gespräch an Claude.

import type { Answer, Question } from '../core/questions.ts';
import { buildAnswer, describeAnswer, fallbackScript, hintFor, parseIntent, proposalToPatch, type SpokenScript } from '../core/voice-questions.ts';
import { parseCommand, type SpeechLang } from '../core/voice.ts';
import type { Store } from '../storage/db.ts';
import { CLAUDE_KEY_META, createDialog, type Dialog, type DialogReply } from './claude-dialog.ts';
import { h, show } from './dom.ts';
import { ANSWERS_KEY, loadAnswers, type QuestionsData } from './questions-view.ts';
import { beep, keepAwake, listen, sayMixed, speechSupport, stopListening, stopSpeaking, unlockAudio, type Heard } from './speech.ts';

export interface QuestionsListenInput {
  store: Store;
  data: QuestionsData;
  closeButton: (onclick: () => void) => HTMLElement;
  back: () => void;
}

/** So lange wird auf eine Entscheidung gewartet (ms). */
const DECISION_MS = 12_000;
/** Diktat einer eigenen Fassung darf länger dauern (ms). */
const DICTATE_MS = 20_000;
const CONFIRM_MS = 6000;

const COMMAND_HELP: [string, string][] = [
  ['„eins“, „zwei“, „beide“', 'Option wählen (bei mehreren Bedeutungen: welche raus soll)'],
  ['„behalten“, „stimmt“, „passt“', 'je nach Frage; „streichen“ nimmt den Eintrag raus'],
  ['„warum?“', 'warum das bisher unklar war'],
  ['„Original“', 'deine Quelle, Bilder in Worten'],
  ['„eigene Fassung …“', 'diktieren, mit „französisch“ davor auf Französisch; wird zu Hause geprüft'],
  ['„überspringen“, „zurück“', 'später klären, letzte Antwort zurücknehmen'],
  ['„Pause“ / „weiter“, „Ende“', 'anhalten, fortsetzen, beenden'],
];

const FAILURE_TEXT = {
  key: 'Der Schlüssel für Claude funktioniert nicht. Ich mache ohne Gespräch weiter.',
  network: 'Keine Verbindung zu Claude. Sag warum, Original oder eine Entscheidung, das geht auch offline.',
  refusal: 'Dazu hat Claude nicht geantwortet. Entscheide bitte selbst oder überspringe die Frage.',
  other: 'Claude hat gerade nicht geantwortet. Versuch es noch einmal oder entscheide selbst.',
};

/** Einstiegsseite: Befehle, Schlüssel für Claude, Start per Tipp (gibt Ton und Mikrofon frei). */
export async function questionsListenPage(input: QuestionsListenInput): Promise<void> {
  const { store, data } = input;
  const answers = await loadAnswers(store, data);
  let key = (await store.getMeta<string>(CLAUDE_KEY_META)) ?? '';
  const open = data.questions.filter((q) => !answers.has(q.id)).length;
  const status = h('p', { class: 'small muted', role: 'status' });
  const keyArea = h('div', { class: 'panel commands' });

  const renderKey = () => {
    if (key) {
      keyArea.replaceChildren(
        h('div', { class: 'label' }, 'Gespräch mit Claude'),
        h('p', { class: 'small' }, 'Eingeschaltet. Was die App nicht als Befehl versteht, geht als Frage an Claude.'),
        h('p', { class: 'small muted' }, 'Übertragen werden nur die aktuelle Frage, ihr Originaltext und was du sagst, keine Bilder und nicht die Wortliste. Das kostet pro Frage etwa 1 bis 5 Cent.'),
        h('button', {
          class: 'link-button',
          textContent: 'Schlüssel von diesem Gerät entfernen',
          onclick: async () => {
            await store.setMeta(CLAUDE_KEY_META, null);
            key = '';
            renderKey();
          },
        }),
      );
      return;
    }
    const field = h('input', { type: 'password', placeholder: 'Schlüssel (API key)', autocomplete: 'off', ariaLabel: 'Schlüssel für Claude' });
    keyArea.replaceChildren(
      h('div', { class: 'label' }, 'Gespräch mit Claude (optional)'),
      h('p', { class: 'small muted' }, 'Ohne Schlüssel: vorbereitete Erklärungen, auch offline. Mit deinem eigenen Schlüssel aus der Anthropic Console kannst du frei nachfragen. Er bleibt nur auf diesem Gerät und kommt nicht in die Sicherung. Setz dort am besten ein Ausgabenlimit.'),
      h(
        'form',
        {
          class: 'row',
          onsubmit: async (ev: Event) => {
            ev.preventDefault();
            const value = field.value.trim();
            if (!value) return;
            await store.setMeta(CLAUDE_KEY_META, value);
            key = value;
            renderKey();
          },
        },
        field,
        h('button', { type: 'submit', textContent: 'Speichern' }),
      ),
    );
  };
  renderKey();

  const start = async () => {
    status.textContent = 'Starte …';
    const err = await unlockAudio(true);
    if (err) {
      status.className = 'small err';
      status.textContent = err;
      return;
    }
    void run(input, answers, key);
  };

  const support = speechSupport();
  show(
    h('div', { class: 'bar' }, input.closeButton(input.back), h('div', { class: 'meter' }), h('span')),
    h(
      'div',
      { class: 'listen-intro' },
      h('h2', {}, 'Rückfragen klären'),
      h('p', { class: 'muted' }, `${open} Fragen offen. Die App liest Frage und Optionen vor und speichert deine Entscheidung. Diktierte Texte prüfst du später am Bildschirm.`),
      !(support.speak && support.listen) && h('p', { class: 'err' }, 'Dieser Browser kann nicht vorlesen oder zuhören.'),
      support.speak && support.listen && open > 0 && h('button', { class: 'primary', textContent: 'Starten', onclick: () => void start() }),
      status,
      keyArea,
      h(
        'div',
        { class: 'panel commands' },
        h('div', { class: 'label' }, 'Das kannst du sagen'),
        ...COMMAND_HELP.map(([words, what]) => h('div', { class: 'command' }, h('b', {}, words), h('span', { class: 'muted' }, what))),
      ),
      h('p', { class: 'small muted' }, 'Im Auto nur mit Halterung und ohne Antippen.'),
    ),
  );
}

type Button = 'pause' | 'resume' | 'repeat' | 'end';

async function run(input: QuestionsListenInput, answers: Map<string, Answer>, initialKey: string): Promise<void> {
  const { store, data } = input;
  let apiKey = initialKey;
  let paused = false;
  let pressed: Button | null = null;
  const release = keepAwake();
  const saved: { q: Question; prev: Answer | undefined }[] = [];
  const skipped = new Set<string>();
  /** In dieser Sitzung offen gelassene Fragen (Begag „nicht aufnehmen“): laut README kein Eintrag im Export. */
  const left = new Set<string>();

  const press = (b: Button) => {
    pressed = b;
    stopSpeaking();
    stopListening();
  };
  const take = (): Button | null => {
    const b = pressed;
    pressed = null;
    return b;
  };

  const status = h('div', { class: 'listen-status', role: 'status' });
  const title = h('div', { class: 'listen-question' });
  const said = h('div', { class: 'listen-heard muted small' });
  const count = h('span', { class: 'muted small' });
  const pauseButton = h('button', { class: 'listen-big', textContent: 'Pause', onclick: () => press(paused ? 'resume' : 'pause') });
  show(
    h('div', { class: 'bar' }, input.closeButton(() => press('end')), h('div', { class: 'meter' }, count), h('span')),
    h('div', { class: 'listen' }, status, title, said),
    h('div', { class: 'listen-controls' }, pauseButton, h('button', { class: 'listen-big', textContent: 'Nochmal', onclick: () => press('repeat') })),
  );
  const setStatus = (text: string, kind = '') => {
    status.textContent = text;
    status.dataset.kind = kind;
  };
  const speak = (text: string) => sayMixed(text, () => pressed !== null);
  const hear = async (lang: SpeechLang, ms: number): Promise<Heard> => {
    if (pressed) return { kind: 'silence' };
    await beep();
    setStatus('Ich höre zu', 'listen');
    return listen(lang, ms);
  };

  const remaining = () => data.questions.filter((q) => !answers.has(q.id) && !left.has(q.id));
  const nextQuestion = () => {
    const open = remaining();
    return open.find((q) => !skipped.has(q.id)) ?? null;
  };
  const counter = () => (count.textContent = `${saved.length} geklärt · ${remaining().length} offen`);

  const persist = () => store.setMeta(ANSWERS_KEY, [...answers.values()]);

  const pause = async (): Promise<'resume' | 'end'> => {
    paused = true;
    pauseButton.textContent = 'Weiter';
    setStatus('Pause – „weiter“ sagen oder tippen', 'pause');
    await sayMixed('Pause.');
    try {
      for (;;) {
        const b = take();
        if (b === 'end') return 'end';
        if (b === 'resume') return 'resume';
        const heard = await listen('de-DE', 10_000);
        const after = take();
        if (after === 'end' || after === 'resume') return after;
        if (heard.kind === 'error') await new Promise((r) => setTimeout(r, 1000));
        if (heard.kind === 'speech') {
          const cmd = parseCommand(heard.alts, ['resume', 'end']);
          if (cmd === 'resume' || cmd === 'end') return cmd;
        }
      }
    } finally {
      paused = false;
      pauseButton.textContent = 'Pause';
    }
  };

  const yesNo = async (): Promise<boolean | 'end' | null> => {
    const heard = await hear('de-DE', CONFIRM_MS);
    const b = take();
    if (b === 'end') return 'end';
    if (b) return null;
    if (heard.kind !== 'speech') return null;
    const cmd = parseCommand(heard.alts, ['yes']);
    if (cmd === 'yes') return true;
    return parseCommand(heard.alts, ['end']) === 'end' ? 'end' : false;
  };

  type Outcome = 'next' | 'undo' | 'end' | { error: string };

  const ask = async (q: Question): Promise<Outcome> => {
    const script: SpokenScript = data.scripts[q.id] ?? fallbackScript(q);
    title.textContent = script.kurz.replace(/[{}]/gu, '');
    said.textContent = '';
    let dialog: Dialog | null = null;
    let silences = 0;

    const readOptions = async () => {
      for (const [i, option] of script.optionen.entries()) await speak(`${i + 1}. ${option}`);
      if (q.group === 'singles' && (q.cur ?? []).length > 0) await speak(`Vorschlag: ${(q.cur ?? []).map((n) => n + 1).join(' und ')}.`);
      if (q.group === 'g1') await speak('Welche Nummer soll raus? Oder alle behalten.');
    };
    const intro = async () => {
      setStatus('…', 'speak');
      await speak(script.kurz);
      await readOptions();
    };
    const save = async (patch: Partial<Answer>): Promise<boolean> => {
      const { answer, problem } = buildAnswer(q, patch, Date.now());
      if (problem) {
        await speak(problem);
        return false;
      }
      saved.push({ q, prev: answers.get(q.id) });
      answers.set(q.id, answer);
      await persist();
      setStatus('Gespeichert', 'ok');
      await speak(describeAnswer(q, answer));
      return true;
    };
    /** Diktat mit Rücklesen; true = gespeichert. */
    const dictate = async (patch: Partial<Answer>, inline: string, lang: SpeechLang): Promise<boolean | 'end'> => {
      let text = inline;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!text) {
          await speak(lang === 'fr-FR' ? 'Bitte auf Französisch sprechen.' : 'Bitte sprechen.');
          const heard = await hear(lang, DICTATE_MS);
          if (take() === 'end') return 'end';
          if (heard.kind !== 'speech') continue;
          text = heard.alts[0] ?? '';
        }
        said.textContent = `Gehört: „${text}“`;
        await speak(lang === 'fr-FR' ? `Ich habe verstanden: {${text}}. Richtig?` : `Ich habe verstanden: ${text}. Richtig?`);
        const ok = await yesNo();
        if (ok === 'end') return 'end';
        if (ok === true) return save({ ...patch, text });
        text = '';
      }
      await speak('Das hat nicht geklappt. Ich lasse die Frage offen.');
      return false;
    };
    /** Antwort von Claude vorlesen, Vorschlag bestätigen lassen. true = Frage erledigt. */
    const handleReply = async (reply: DialogReply): Promise<boolean | 'end'> => {
      if (reply.failure) {
        if (reply.failure === 'key') {
          apiKey = '';
          dialog = null;
        }
        await speak(FAILURE_TEXT[reply.failure]);
        return false;
      }
      if (reply.speech) {
        title.textContent = reply.speech.replace(/[{}]/gu, '');
        await speak(reply.speech);
      }
      if (!reply.proposal) return false;
      const converted = proposalToPatch(q, reply.proposal);
      const checked = 'patch' in converted ? buildAnswer(q, converted.patch, Date.now()) : null;
      const problem = 'problem' in converted ? converted.problem : checked?.problem;
      if (problem || !checked) {
        dialog?.reject();
        await speak(problem ?? 'Das konnte ich nicht eintragen.');
        return false;
      }
      await speak(`Ich trage ein: ${describeAnswer(q, checked.answer)} ${checked.answer.text ? `Text: ${checked.answer.text}. ` : ''}Richtig?`);
      const ok = await yesNo();
      if (ok === 'end') return 'end';
      if (ok === true && 'patch' in converted) return save(converted.patch);
      dialog?.reject();
      await speak('Gut, nichts eingetragen.');
      return false;
    };
    const askClaude = async (text: string): Promise<boolean | 'end'> => {
      dialog ??= createDialog(apiKey, q, script);
      setStatus('Claude denkt nach', 'speak');
      return handleReply(await dialog.send(text));
    };

    await intro();
    for (;;) {
      const heard = await hear('de-DE', DECISION_MS);
      const button = take();
      if (button === 'end') return 'end';
      if (button === 'repeat') {
        await intro();
        continue;
      }
      if (button === 'pause' || button === 'resume') {
        if ((await pause()) === 'end') return 'end';
        await intro();
        continue;
      }
      if (heard.kind === 'error') return { error: heard.error === 'not-allowed' || heard.error === 'service-not-allowed' ? 'Kein Zugriff auf Mikrofon oder Spracherkennung.' : `Spracherkennung: ${heard.error}` };
      if (heard.kind === 'silence') {
        // Nicht weiterblättern, während er sich auf den Verkehr konzentriert.
        if (++silences >= 2) {
          silences = 0;
          if ((await pause()) === 'end') return 'end';
          await intro();
        }
        continue;
      }
      silences = 0;
      said.textContent = `Gehört: „${heard.alts[0] ?? ''}“`;
      const intent = parseIntent(q, heard.alts);
      let done: boolean | 'end' = false;
      switch (intent.kind) {
        case 'decide':
          done = await save(intent.patch);
          break;
        case 'dictate':
          done = await dictate(intent.patch, intent.inline, intent.lang);
          break;
        case 'refuse':
          await speak(intent.message);
          break;
        case 'leave':
          left.add(q.id);
          await speak('Nicht aufgenommen.');
          return 'next';
        case 'ask':
        case 'unknown':
          if (apiKey && intent.text) done = await askClaude(intent.text);
          else await speak(intent.kind === 'ask' ? 'Für freie Fragen brauche ich den Schlüssel für Claude.' : `Das habe ich nicht verstanden. ${hintFor(q)}`);
          break;
        case 'nav':
          switch (intent.command) {
            case 'why':
              await speak(script.warum);
              break;
            case 'original':
              await speak(script.original);
              break;
            case 'options':
              await readOptions();
              break;
            case 'repeat':
              await intro();
              break;
            case 'skip':
              skipped.add(q.id);
              await speak('Später.');
              return 'next';
            case 'undo':
              return 'undo';
            case 'pause':
              if ((await pause()) === 'end') return 'end';
              await intro();
              break;
            case 'end':
              return 'end';
          }
          break;
      }
      if (done === 'end') return 'end';
      if (done) return 'next';
    }
  };

  let error: string | null = null;
  try {
    let q = nextQuestion();
    await sayMixed(`${remaining().length} Fragen offen.`);
    while (q) {
      counter();
      const out = await ask(q);
      if (out === 'end') break;
      if (typeof out === 'object') {
        error = out.error;
        break;
      }
      if (out === 'undo') {
        const last = saved.pop();
        if (last) {
          if (last.prev) answers.set(last.q.id, last.prev);
          else answers.delete(last.q.id);
          await persist();
          await sayMixed('Zurückgenommen.');
          q = last.q;
        } else {
          await sayMixed('Nichts zum Zurücknehmen.');
        }
        continue;
      }
      q = nextQuestion();
    }
  } finally {
    stopListening();
    release();
  }
  const done = saved.length;
  const later = remaining().length;
  const dictated = saved.filter((s) => answers.get(s.q.id)?.unterwegs).length;
  stopSpeaking();
  const dictatedText = dictated === 1 ? '1 diktierter Text' : `${dictated} diktierte Texte`;
  if (!error) void sayMixed(`Ende. ${done} geklärt, ${later} offen.${dictated > 0 ? ` ${dictatedText} zum Prüfen zu Hause.` : ''}`);
  show(
    h(
      'div',
      { class: 'end' },
      error && h('p', { class: 'err' }, error),
      h('div', { class: 'panel' }, h('b', {}, String(done)), h('p', { class: 'muted' }, `geklärt · ${later} offen`)),
      dictated > 0 && h('p', { class: 'muted small' }, `${dictatedText} zum Prüfen: „Rückfragen zur Liste“ → „Prüfen“.`),
      h('button', { class: 'primary', textContent: 'Zurück', onclick: () => (stopSpeaking(), input.back()) }),
    ),
  );
}
