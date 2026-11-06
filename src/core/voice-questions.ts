// Rückfragen per Sprache, ohne DOM: Sprechtexte, gesprochene Entscheidungen, Rückfrage an Claude (nur die Texte).
// Eine Entscheidung ergibt immer eine Antwort im Exportformat aus questions.ts.

import { emptyAnswer, validate, type Answer, type Question, type Verdict } from './questions.ts';
import { commandForm, type SpeechLang } from './voice.ts';

/** Sprechtext einer Frage (private/rueckfragen/sprechtexte.json). Französisches steht in {geschweiften Klammern}. */
export interface SpokenScript {
  kurz: string;
  warum: string;
  original: string;
  optionen: string[];
}

export interface SpeechPart {
  text: string;
  lang: SpeechLang;
}

/** „Unter Katze steht {le chat}.“ → abwechselnd deutsche und französische Stimme. */
export function splitSpeech(text: string): SpeechPart[] {
  const parts: SpeechPart[] = [];
  for (const [i, raw] of text.split(/[{}]/u).entries()) {
    const t = raw.trim();
    if (t) parts.push({ text: t, lang: i % 2 === 1 ? 'fr-FR' : 'de-DE' });
  }
  return parts;
}

/** Ersatz, falls der Katalog neuer ist als die Sprechtexte: aus den Katalogfeldern, ohne Begründung. */
export function fallbackScript(q: Question): SpokenScript {
  const entry = q.fr || q.de ? `{${q.fr ?? ''}}${q.de ? `, auf Deutsch ${q.de}` : ''}` : '';
  const kurz: Record<Question['group'], string> = {
    singles: q.q ?? entry,
    g1: `Unter ${q.title ?? ''} stehen mehrere Bedeutungen. Soll eine raus?`,
    g2: `Deine Notiz {${q.jan ?? ''}} habe ich aufgelöst als {${q.res ?? ''}}. Stimmt das?`,
    g3: `Die Zeile bricht ab: {${q.jan ?? ''}}. Angesetzt ist {${q.res ?? ''}}. Wie geht es weiter?`,
    g4: `${entry}. Aus einem englischen Lexikon. Behalten?`,
    g5: `${entry}. Von der Listenpflege ergänzt. Passt das?`,
    g6: `${entry}. Neu aus den Vocs. Behalten?`,
    g7: `${entry}. Annotation zum Begag-Text. Aufnehmen?`,
  };
  const options = q.group === 'singles' ? q.opts : q.group === 'g1' ? q.chips : [];
  return {
    kurz: kurz[q.group],
    warum: 'Zu dieser Frage habe ich noch keine Begründung.',
    original: q.original ? `In ${q.original.src} steht: ${q.original.lines.map((l) => l.t).join(', ')}` : 'Dazu liegt mir nur der Listeneintrag vor.',
    optionen: (options ?? []).map((o) => (q.group === 'g1' && q.side === 'de' ? o : `{${o}}`)),
  };
}

const NUMBER_WORDS: Record<string, number> = {
  '1': 1, eins: 1, erste: 1, ersten: 1, erstens: 1,
  '2': 2, zwei: 2, zwo: 2, zweite: 2, zweiten: 2, zweitens: 2,
  '3': 3, drei: 3, dritte: 3, dritten: 3, drittens: 3,
  '4': 4, vier: 4, vierte: 4, vierten: 4, viertens: 4,
  '5': 5, funf: 5, funfte: 5, funften: 5,
  '6': 6, sechs: 6, sechste: 6, sechsten: 6,
  '7': 7, sieben: 7, siebte: 7, siebten: 7,
  '8': 8, acht: 8, achte: 8, achten: 8,
  '9': 9, neun: 9, neunte: 9, neunten: 9,
};
const NUMBER_FILLER = new Set(['option', 'optionen', 'nummer', 'die', 'der', 'das', 'den', 'und', 'nimm', 'nehme', 'nehmen', 'ich', 'bitte', 'antwort', 'fassung', 'auch', 'mit']);

/** Zahlen einer Äußerung; null, wenn außer Zahlen und Füllwörtern noch etwas anderes gesagt wurde. */
export function numbersIn(form: string): number[] | null {
  const out: number[] = [];
  for (const word of form.split(' ')) {
    const n = NUMBER_WORDS[word];
    if (n !== undefined) {
      if (!out.includes(n)) out.push(n);
    } else if (!NUMBER_FILLER.has(word)) return null;
  }
  return out.length > 0 ? out : null;
}

export type NavCommand = 'why' | 'original' | 'options' | 'repeat' | 'skip' | 'undo' | 'pause' | 'end';

export type Intent =
  | { kind: 'nav'; command: NavCommand }
  /** Antwort steht fest. */
  | { kind: 'decide'; patch: Partial<Answer> }
  /** Freitext nötig; `inline`, wenn er schon mitgesprochen wurde. */
  | { kind: 'dictate'; patch: Partial<Answer>; inline: string; lang: SpeechLang }
  | { kind: 'refuse'; message: string }
  /** g7: nicht aufnehmen, die Frage bleibt laut README unbeantwortet. */
  | { kind: 'leave' }
  /** Frage an Claude: `text` ist das Gesagte. */
  | { kind: 'ask'; text: string }
  | { kind: 'unknown'; text: string };

const NAV: Record<NavCommand, string[]> = {
  why: ['warum', 'wieso', 'warum das', 'warum problematisch', 'erklar', 'erklaren', 'erklar mal', 'erklar das', 'begrundung'],
  original: ['original', 'das original', 'originaltext', 'quelle', 'was steht da', 'bild'],
  options: ['optionen', 'die optionen', 'auswahl', 'welche optionen'],
  repeat: ['nochmal', 'noch mal', 'noch einmal', 'wiederholen', 'wie bitte'],
  skip: ['uberspringen', 'uberspring', 'spater', 'nachste', 'nachste frage', 'weiter'],
  undo: ['zuruck', 'ruckgangig'],
  pause: ['pause', 'warte', 'stopp', 'stop', 'halt'],
  end: ['ende', 'schluss', 'beenden', 'aufhoren', 'fertig'],
};

const DELETE = ['streichen', 'eintrag streichen', 'ganz streichen', 'alles streichen', 'wegwerfen', 'loschen', 'eintrag loschen'];
/** Zuerst der längste Treffer: „eigene fassung französisch …“ vor „eigene fassung …“. */
const DICTATE_PREFIXES = ['eigene fassung', 'eigene bedeutung', 'fortsetzung', 'korrektur', 'richtig ist', 'weiter geht es mit', 'es geht weiter mit'];

/** Die gewünschte Fassung wörtlich aus dem Erkannten, weil commandForm Akzente und Satzzeichen entfernt. */
function textAfter(raw: string, prefixWords: number): string {
  return raw.trim().split(/\s+/u).slice(prefixWords).join(' ').replace(/^[:,.\s]+/u, '').trim();
}

const DICTATE_PATCH: Partial<Record<Question['group'], Partial<Answer>>> = {
  singles: {},
  g2: { verdict: 'falsch' },
  g3: {},
  g5: { verdict: 'passt' },
  g6: { verdict: 'behalten' },
  g7: { verdict: 'aufnehmen' },
};

function dictation(q: Question, raw: string, form: string): Intent | null {
  const patch = DICTATE_PATCH[q.group];
  if (!patch) return null;
  for (const prefix of DICTATE_PREFIXES) {
    if (form === prefix || form.startsWith(`${prefix} `)) {
      const words = prefix.split(' ').length;
      const french = form.split(' ')[words] === 'franzosisch';
      return { kind: 'dictate', patch, inline: textAfter(raw, words + (french ? 1 : 0)), lang: french ? 'fr-FR' : 'de-DE' };
    }
  }
  return null;
}

const VERDICT_WORDS: Partial<Record<Question['group'], { verdict: Verdict; words: string[] }>> = {
  g2: { verdict: 'stimmt', words: ['stimmt', 'ja', 'richtig', 'das stimmt', 'ja stimmt'] },
  g3: { verdict: 'lassen', words: ['so lassen', 'lassen', 'lass es so', 'ja'] },
  g4: { verdict: 'behalten', words: ['behalten', 'ja', 'bleibt', 'ja behalten'] },
  g5: { verdict: 'passt', words: ['passt', 'ja', 'das passt', 'stimmt', 'ja passt'] },
  g6: { verdict: 'behalten', words: ['behalten', 'ja', 'bleibt', 'ja behalten'] },
  g7: { verdict: 'aufnehmen', words: ['aufnehmen', 'ja', 'ja aufnehmen'] },
};

function decide(q: Question, form: string): Intent | null {
  if (DELETE.includes(form) && q.group !== 'g7') return { kind: 'decide', patch: { del: true } };
  const verdict = VERDICT_WORDS[q.group];
  if (verdict?.words.includes(form)) return { kind: 'decide', patch: { verdict: verdict.verdict } };
  if (q.group === 'g2' && (form === 'falsch' || form === 'nein' || form === 'stimmt nicht')) return { kind: 'dictate', patch: { verdict: 'falsch' }, inline: '', lang: 'de-DE' };
  if (q.group === 'g7' && (form === 'nicht aufnehmen' || form === 'nein')) return { kind: 'leave' };

  if (q.group === 'singles') {
    const opts = q.opts ?? [];
    if (['vorschlag', 'so lassen', 'lassen', 'wie vorgeschlagen', 'bleibt so'].includes(form) && (q.cur ?? []).length > 0) {
      return { kind: 'decide', patch: { picks: (q.cur ?? []).map((i) => opts[i]).filter((o): o is string => o !== undefined) } };
    }
    if ((form === 'beide' || form === 'alle' || form === 'alle beide') && q.multi) return { kind: 'decide', patch: { picks: [...opts] } };
    const nums = numbersIn(form);
    if (!nums) return null;
    if (nums.some((n) => n > opts.length)) return { kind: 'refuse', message: `Es gibt nur ${opts.length} Optionen.` };
    if (nums.length > 1 && !q.multi) return { kind: 'refuse', message: 'Hier geht nur eine Option.' };
    return { kind: 'decide', patch: { picks: nums.map((n) => opts[n - 1]!) } };
  }

  if (q.group === 'g1') {
    const chips = q.chips ?? [];
    if (['alle behalten', 'alle bleiben', 'behalten', 'alles behalten', 'bleiben alle', 'keine', 'keine davon', 'nichts', 'alle'].includes(form)) return { kind: 'decide', patch: { removed: [] } };
    const only = /^nur (.+?)(?: behalten| bleibt)?$/u.exec(form);
    const out = /^(?:ohne )?(.+?)(?: streichen| raus| weg)?$/u.exec(form);
    const nums = numbersIn(only?.[1] ?? out?.[1] ?? form);
    if (!nums) return null;
    if (nums.some((n) => n > chips.length)) return { kind: 'refuse', message: `Es gibt nur ${chips.length} Bedeutungen.` };
    const removed = only ? chips.filter((_, i) => !nums.includes(i + 1)) : nums.map((n) => chips[n - 1]!);
    if (removed.length >= chips.length) return { kind: 'refuse', message: 'Eine Bedeutung muss bleiben, sonst sag streichen.' };
    return { kind: 'decide', patch: { removed } };
  }
  return null;
}

/** Was wurde gesagt? Entscheidungen vor Navigation, sonst würde „weiter geht es mit …“ überspringen. */
export function parseIntent(q: Question, alternatives: string[]): Intent {
  for (const raw of alternatives) {
    const form = commandForm(raw);
    const d = dictation(q, raw, form) ?? decide(q, form);
    if (d) return d;
    for (const [command, words] of Object.entries(NAV)) if (words.includes(form)) return { kind: 'nav', command: command as NavCommand };
    if (form === 'frage' || form.startsWith('frage ')) return { kind: 'ask', text: textAfter(raw, 1) };
  }
  return { kind: 'unknown', text: alternatives[0] ?? '' };
}

/** Vollständige Antwort aus einem Teilergebnis. Freitext wird als „unterwegs diktiert“ markiert und später geprüft. */
export function buildAnswer(q: Question, patch: Partial<Answer>, now: number): { answer: Answer; problem: string | null } {
  const text = patch.text?.trim() ?? '';
  const answer: Answer = { ...emptyAnswer(q.id), ...patch, text, ts: now, ...(text ? { unterwegs: true } : {}) };
  return { answer, problem: validate(q, answer) };
}

const VERDICT_TEXT: Record<Exclude<Verdict, ''>, string> = {
  stimmt: 'Stimmt.',
  falsch: 'Falsch.',
  lassen: 'Bleibt so.',
  behalten: 'Behalten.',
  passt: 'Passt.',
  aufnehmen: 'Aufnehmen.',
};

/** Rückmeldung nach dem Speichern: mit der Nummer, die Optionstexte hat er gerade gehört. */
export function describeAnswer(q: Question, a: Answer): string {
  if (a.del) return 'Eintrag wird gestrichen.';
  const parts: string[] = [];
  if (q.group === 'singles' && a.picks.length > 0) {
    const nums = a.picks.map((p) => (q.opts ?? []).indexOf(p) + 1);
    parts.push(nums.length === 1 ? `Option ${nums[0]}.` : `Optionen ${nums.join(' und ')}.`);
  }
  if (q.group === 'g1') {
    const nums = a.removed.map((c) => (q.chips ?? []).indexOf(c) + 1);
    parts.push(nums.length === 0 ? 'Alle bleiben.' : `Ohne ${nums.join(' und ')}.`);
  }
  if (a.verdict) parts.push(VERDICT_TEXT[a.verdict]);
  if (a.text) parts.push('Text zum Prüfen vorgemerkt.');
  return parts.join(' ');
}

/** Was er gerade sagen kann, wenn nichts erkannt wurde. */
export function hintFor(q: Question): string {
  const nav = 'Oder warum, Original, überspringen.';
  switch (q.group) {
    case 'singles':
      return `Sag eine Zahl, eigene Fassung oder streichen. ${nav}`;
    case 'g1':
      return `Sag, welche Nummer raus soll, alle behalten oder streichen. ${nav}`;
    case 'g2':
      return `Sag stimmt, falsch oder streichen. ${nav}`;
    case 'g3':
      return `Sag so lassen, Fortsetzung oder streichen. ${nav}`;
    case 'g5':
      return `Sag passt, Korrektur oder streichen. ${nav}`;
    case 'g7':
      return `Sag aufnehmen oder nicht aufnehmen. ${nav}`;
    default:
      return `Sag behalten, Korrektur oder streichen. ${nav}`;
  }
}

// --- Gespräch mit Claude: nur die Texte; der Aufruf liegt in app/claude-dialog.ts. ---

export const CLAUDE_SYSTEM = `Du sprichst mit Jan, der im Auto seine französische Vokabelliste klärt. Er hört dich nur, er sieht nichts, und er antwortet per Spracherkennung.

So antwortest du:
- Deutsch, kurz, ein bis drei Sätze, wie im Gespräch. Keine Listen, keine Formatierung, keine Symbole.
- Setze jedes französische Wort und jede französische Wendung in geschweifte Klammern, damit die französische Stimme es liest: {le chat}. Deutsches nie in Klammern.
- Seine Worte kommen aus einer deutschen Spracherkennung. Französisches darin ist oft verstümmelt; erschließe es aus dem Zusammenhang und frag nach, wenn es wirklich nicht klar ist.

Worum es geht: Eine Frage zu einem Listeneintrag ist offen. Erkläre, was unklar ist, beantworte seine Rückfragen zur Bedeutung und Verwendung und sag ehrlich, wenn du dir bei etwas nicht sicher bist. Du berätst, er entscheidet.

Sobald seine Entscheidung klar ist, rufe das Werkzeug antwort_vorschlagen auf. Rate keine Entscheidung, die er nicht getroffen hat. Er bestätigt den Vorschlag danach selbst.

Felder von antwort_vorschlagen je nach Gruppe:
- singles: picks = Nummern der gewählten Optionen; text = eigene Fassung; del = Eintrag streichen.
- g1: removed = Nummern der Bedeutungen, die raus sollen; del = Eintrag streichen.
- g2: verdict stimmt, oder falsch mit text = richtige Fassung; oder del.
- g3: text = wie die Zeile weitergeht, oder verdict lassen; oder del.
- g4: verdict behalten, oder del.
- g5: verdict passt, oder del; text = richtige Bedeutung, falls nötig.
- g6: verdict behalten, oder del; text = Korrektur, falls nötig.
- g7: verdict aufnehmen; text = eigene Bedeutung, falls nötig.
Nicht benötigte Felder bleiben leer: leere Listen, leerer Text, verdict "", del false.
Wenn Jan überspringen oder etwas offen lassen will, ruf das Werkzeug nicht auf und sag ihm, dass er „überspringen“ sagen kann.`;

/** Was Claude zu einer Frage erfährt: nur diese Frage, ihr Original und der Sprechtext. Keine Wortliste, kein Bild. */
export function questionContext(q: Question, script: SpokenScript): string {
  const { original: _o, bild: _b, ...fields } = q;
  const lines = [
    `Gruppe: ${q.group}`,
    `Katalogfelder: ${JSON.stringify(fields)}`,
    q.original ? `Sein Original (${q.original.src}): ${(q.original.ctx.length > 0 ? q.original.ctx : q.original.lines).map((l) => l.t).join(' | ')}` : '',
    `Was er schon gehört hat: ${script.kurz}`,
    `Begründung, warum es unklar ist: ${script.warum}`,
    `Quelle in Worten: ${script.original}`,
    script.optionen.length > 0 ? `Nummerierte Auswahl: ${script.optionen.map((o, i) => `${i + 1}. ${o}`).join(' ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export interface ClaudeProposal {
  picks: number[];
  removed: number[];
  verdict: Verdict;
  text: string;
  del: boolean;
}

/** Vorschlag von Claude (Nummern) in Antwortfelder (wörtliche Texte); unbekannte Nummern ergeben eine Fehlermeldung. */
export function proposalToPatch(q: Question, p: ClaudeProposal): { patch: Partial<Answer> } | { problem: string } {
  const pick = (list: string[] | undefined, nums: number[]) => nums.map((n) => list?.[n - 1]);
  const picks = pick(q.opts, p.picks);
  const removed = pick(q.chips, p.removed);
  if (picks.includes(undefined) || removed.includes(undefined)) return { problem: 'Diese Nummer gibt es nicht.' };
  return { patch: { picks: picks as string[], removed: removed as string[], verdict: p.verdict, text: p.text, del: p.del } };
}
