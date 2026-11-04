// Hörmodus ohne DOM: was vorgelesen wird, wie Gesprochenes mit der Lösung verglichen wird, welche Sprachbefehle gelten.
// Spracherkennung liefert ganze Wörter ohne Akzentfehler, aber oft mit Füllwörtern und falscher Großschreibung;
// der Vergleich ist deshalb großzügiger als im Tippmodus.

import { meaningLines } from './display.ts';
import { answerVariants, normalizeAnswer } from './normalize.ts';

export type SpeechLang = 'fr-FR' | 'de-DE';

const FR_PLACEHOLDERS: [RegExp, string][] = [
  [/\b(?:qn|qqn)\b\.?/gu, "quelqu'un"],
  [/\b(?:qc|qch|qqch|qqc)\b\.?/gu, 'quelque chose'],
];
const DE_PLACEHOLDERS: [RegExp, string][] = [
  [/\bjdn\b\.?/gu, 'jemanden'],
  [/\bjdm\b\.?/gu, 'jemandem'],
  [/\bjds\b\.?/gu, 'jemandes'],
  [/\betw\.?(?=\s|$|[,;])/gu, 'etwas'],
  [/\bugs\.?(?=\s|$)/gu, 'umgangssprachlich'],
];

function clean(s: string, placeholders: [RegExp, string][]): string {
  let t = s.replace(/\([^()]*\)/gu, ' ').replace(/[()]/gu, ' ');
  for (const [re, by] of placeholders) t = t.replace(re, by);
  // Femininendung „effronté, -e“ nicht vorlesen.
  t = t.replace(/,\s*-\p{L}+/gu, '');
  return t.replace(/\s+/gu, ' ').trim();
}

/** Französisches Lemma zum Vorlesen: ohne Klammerzusätze, Platzhalter ausgeschrieben. */
export function speakFrench(fr: string): string {
  return clean(fr, FR_PLACEHOLDERS);
}

/** Deutsche Bedeutungen zum Vorlesen: höchstens `max` Bedeutungen, ohne Beispiele und Klammern. */
export function speakGerman(de: string, max = 3): string {
  const lines = meaningLines(de)
    .filter((l) => !l.example)
    .map((l) => clean(l.text, DE_PLACEHOLDERS))
    .filter((t) => t !== '');
  return lines.slice(0, max).join('; ');
}

const DE_ARTICLE = /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\s+/u;
const FILLER = /\b(?:jemanden|jemandem|jemandes|jemand|etwas|quelqu'un|quelque chose|sich|se|s')\s*/gu;

const DANGLING = /\s(?:a|de|d|en|zu|an|auf|mit|von|fur|uber)$/u;

/** Vergleichsform für Gesprochenes und für Lösungsvarianten. */
export function normalizeSpoken(s: string): string {
  let t = normalizeAnswer(s);
  t = t.replace(/-/gu, ' ');
  t = t.replace(DE_ARTICLE, '');
  t = t.replace(FILLER, ' ');
  t = t.replace(/[.,;:!?…«»"]/gu, ' ').replace(/\s+/gu, ' ').trim();
  // Nach entferntem Platzhalter bleibt oft eine Präposition übrig („rendre service à qn“).
  return t.replace(DANGLING, '').trim();
}

/** Lösungsvarianten eines Feldes in Vergleichsform (Französisch oder Deutsch). */
export function spokenVariants(field: string, lang: SpeechLang): string[] {
  const source = lang === 'de-DE' ? meaningLines(field).filter((l) => !l.example).map((l) => l.text).join('; ') : field;
  const out: string[] = [];
  for (const v of answerVariants(source)) {
    const n = normalizeSpoken(v);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Ab dieser Länge darf eine Variante auch innerhalb eines längeren Satzes stehen („ich glaube, der Staub“). */
const MIN_CONTAINED = 4;

/**
 * Passt eine der erkannten Alternativen zu einer Lösungsvariante?
 * Liefert die passende Alternative (für das Protokoll) oder null.
 */
export function spokenMatch(alternatives: string[], field: string, lang: SpeechLang): string | null {
  const variants = spokenVariants(field, lang);
  for (const alt of alternatives) {
    const said = normalizeSpoken(alt);
    if (!said) continue;
    const padded = ` ${said} `;
    if (variants.some((v) => v === said || (v.length >= MIN_CONTAINED && padded.includes(` ${v} `)))) return alt;
  }
  return null;
}

export type Command = 'dontknow' | 'repeat' | 'undo' | 'pause' | 'resume' | 'end' | 'report' | 'yes';

/**
 * Befehle in beiden Sprachen, weil die Erkennung je nach Richtung auf Französisch oder Deutsch hört.
 * Nur ganze Äußerungen zählen, damit Antworten wie „passer“ kein Befehl werden.
 */
const COMMANDS: Record<Command, string[]> = {
  dontknow: ['weiss nicht', 'weiss ich nicht', 'ich weiss es nicht', 'keine ahnung', 'nicht gewusst', 'wusste ich nicht', 'je ne sais pas', 'je sais pas', 'aucune idee', 'passe', 'weiter'],
  repeat: ['nochmal', 'noch mal', 'noch einmal', 'wiederholen', 'wie bitte', 'repete', 'repetez', 'encore'],
  undo: ['zuruck', 'ruckgangig', 'retour', 'annuler'],
  pause: ['pause', 'warte', 'stopp', 'stop', 'halt'],
  resume: ['weiter', 'weitermachen', 'fortsetzen', 'los', 'continue', 'continuer', 'on continue', 'vas y'],
  end: ['ende', 'schluss', 'beenden', 'aufhoren', 'fertig', 'fin', 'termine', 'arrete'],
  report: ['melden', 'fehler melden', 'signaler'],
  yes: ['doch', 'gewusst', 'wusste ich', 'stimmt', 'war richtig', 'richtig', 'ja', 'oui', 'si', 'correct'],
};

function commandForm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/gu, 'ss')
    .replace(/[’'`´-]/gu, ' ')
    .replace(/[.,;:!?…«»"]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Befehl aus den erkannten Alternativen; `allowed` begrenzt, was in der aktuellen Lage gilt. */
export function parseCommand(alternatives: string[], allowed: Command[]): Command | null {
  for (const alt of alternatives) {
    const said = commandForm(alt);
    for (const c of allowed) if (COMMANDS[c].includes(said)) return c;
  }
  return null;
}
