// Rückfragen-Modus: offene Fragen der Chat-Sitzung zur Vokabelliste beantworten.
// Datenbasis und Exportformat: private/rueckfragen/README.md (Katalog der Chat-Sitzung, bleibt lokal).

export type Group = 'singles' | 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'g7';
export const ANSWERABLE: Group[] = ['singles', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'];

export type Verdict = '' | 'stimmt' | 'falsch' | 'lassen' | 'behalten' | 'passt' | 'aufnehmen';

export interface OriginalLine {
  t: string;
  n: number;
  src?: string;
  hit?: boolean;
}

export interface Original {
  src: string;
  lines: OriginalLine[];
  ctx: OriginalLine[];
}

/** Eine Frage aus `katalog.json`; welche Felder belegt sind, hängt von der Gruppe ab. */
export interface Question {
  id: string;
  group: Group;
  q?: string;
  opts?: string[];
  multi?: boolean;
  cur?: number[];
  note?: string;
  fr?: string;
  de?: string;
  dir?: string;
  q0?: string;
  n?: string;
  title?: string;
  chips?: string[];
  side?: 'fr' | 'de';
  jan?: string;
  res?: string;
  original?: Original;
  bild?: string;
}

export interface Catalog {
  stand: string;
  gruppen: Record<string, string>;
  fragen: Record<string, unknown[]>;
}

/** Antwort genau im Format von `antworten_bisher.json` (README, Abschnitt Export). */
export interface Answer {
  id: string;
  picks: string[];
  removed: string[];
  verdict: Verdict;
  text: string;
  del: boolean;
  ts: number;
  /** Per Sprache diktierter Freitext, noch nicht am Bildschirm geprüft. Kommt nicht in den Export. */
  unterwegs?: boolean;
}

/** Fragen aller beantwortbaren Gruppen in Katalogreihenfolge; `auto` und `skipped` sind nur Information. */
export function questionsFrom(catalog: Catalog): Question[] {
  const out: Question[] = [];
  for (const group of ANSWERABLE) {
    for (const raw of catalog.fragen[group] ?? []) {
      const q = raw as Omit<Question, 'group'>;
      if (q && typeof q.id === 'string') out.push({ ...q, group });
    }
  }
  return out;
}

export function emptyAnswer(id: string): Answer {
  return { id, picks: [], removed: [], verdict: '', text: '', del: false, ts: 0 };
}

/** Bisherige Antworten (z. B. aus dem Artefakt) auf das vollständige Format bringen. */
export function normalizeAnswer(raw: Partial<Answer> & { id: string }): Answer {
  return {
    id: raw.id,
    picks: Array.isArray(raw.picks) ? raw.picks.map(String) : [],
    removed: Array.isArray(raw.removed) ? raw.removed.map(String) : [],
    verdict: (raw.verdict ?? '') as Verdict,
    text: typeof raw.text === 'string' ? raw.text : '',
    del: raw.del === true,
    ts: typeof raw.ts === 'number' ? raw.ts : 0,
    ...(raw.unterwegs ? { unterwegs: true } : {}),
  };
}

/**
 * Startwert des Formulars: vorhandene Antwort, sonst der Vorschlag laut README
 * (bei Einzelfragen die Optionen aus `cur`, sonst nichts gewählt).
 */
export function draftFor(q: Question, existing: Answer | undefined): Answer {
  if (existing) return { ...existing, picks: [...existing.picks], removed: [...existing.removed] };
  const a = emptyAnswer(q.id);
  if (q.group === 'singles') a.picks = (q.cur ?? []).map((i) => q.opts?.[i]).filter((x): x is string => typeof x === 'string');
  return a;
}

/** Welche Urteile die Gruppe kennt (README, Tabelle). */
export const VERDICTS: Partial<Record<Group, { value: Verdict; label: string }[]>> = {
  g2: [
    { value: 'stimmt', label: 'Stimmt' },
    { value: 'falsch', label: 'Falsch, richtig ist …' },
  ],
  g3: [{ value: 'lassen', label: 'So lassen' }],
  g4: [{ value: 'behalten', label: 'Behalten' }],
  g5: [{ value: 'passt', label: 'Passt' }],
  g6: [{ value: 'behalten', label: 'Behalten' }],
  g7: [{ value: 'aufnehmen', label: 'Aufnehmen' }],
};

/** Prüft eine Antwort vor dem Speichern; liefert einen Hinweis oder null. */
export function validate(q: Question, a: Answer): string | null {
  if (a.del) return null;
  switch (q.group) {
    case 'singles':
      if (a.picks.length === 0 && !a.text.trim()) return 'Eine Option wählen, eine eigene Fassung eintragen oder „streichen“.';
      if (!q.multi && a.picks.length > 1) return 'Hier nur eine Option wählen.';
      if (a.picks.some((p) => !q.opts?.includes(p))) return 'Unbekannte Option.';
      return null;
    case 'g1':
      if (q.chips && a.removed.length >= q.chips.length) return 'Mindestens eine Bedeutung muss bleiben, sonst „streichen“.';
      return null;
    case 'g2':
      if (!a.verdict) return '„Stimmt“ oder „Falsch“ wählen.';
      if (a.verdict === 'falsch' && !a.text.trim()) return 'Bei „Falsch“ bitte die richtige Fassung eintragen.';
      return null;
    case 'g3':
      if (!a.text.trim() && a.verdict !== 'lassen') return 'Fortsetzung eintragen, „So lassen“ oder „streichen“.';
      return null;
    default:
      if (!a.verdict) return 'Eine Entscheidung wählen.';
      return null;
  }
}

/** Exportdatei für die Chat-Sitzung: ein Objekt pro beantworteter Frage, Schlüssel = id (README). */
export function exportAnswers(answers: Iterable<Answer>): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const a of [...answers].sort((x, y) => x.id.localeCompare(y.id))) {
    out[a.id] = { id: a.id, picks: a.picks, removed: a.removed, verdict: a.verdict, text: a.text, del: a.del, ts: a.ts };
  }
  return out;
}

/** Vorbelegen: bisherige Antworten nur übernehmen, wo hier noch keine Antwort steht. */
export function prefill(local: Map<string, Answer>, previous: Record<string, Partial<Answer> & { id: string }>): Map<string, Answer> {
  const out = new Map(local);
  for (const [id, raw] of Object.entries(previous)) if (!out.has(id)) out.set(id, normalizeAnswer({ ...raw, id }));
  return out;
}

/** Zusammenführen (z. B. aus einer Sicherung): je Frage gewinnt die jüngere Antwort. */
export function mergeAnswers(local: Map<string, Answer>, incoming: Answer[]): Map<string, Answer> {
  const out = new Map(local);
  for (const a of incoming) {
    const mine = out.get(a.id);
    if (!mine || a.ts > mine.ts) out.set(a.id, normalizeAnswer(a));
  }
  return out;
}
