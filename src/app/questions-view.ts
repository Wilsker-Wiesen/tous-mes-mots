// Seite „Rückfragen“: eine Frage pro Karte, Originaltext und Bild immer sichtbar, Antworten lokal speichern,
// Export als JSON für die Chat-Sitzung (Format: private/rueckfragen/README.md).

import {
  draftFor,
  exportAnswers,
  prefill,
  questionsFrom,
  validate,
  VERDICTS,
  type Answer,
  type Catalog,
  type Original,
  type Question,
} from '../core/questions.ts';
import type { Store } from '../storage/db.ts';
import { h, show } from './dom.ts';

export const ANSWERS_KEY = 'rueckfragen:antworten';
const PREFILLED_KEY = 'rueckfragen:vorbelegt';
const BASE = './data/rueckfragen/';

export interface QuestionsData {
  catalog: Catalog;
  questions: Question[];
  previous: Record<string, Partial<Answer> & { id: string }>;
  /** Bildadresse zu `bild` (Datei in der Entwicklung, data:-URL aus dem Tresor). */
  image: (bild: string) => string;
}

/** Katalog laden; null, wenn auf diesem Gerät keiner vorhanden ist. */
export async function loadQuestions(): Promise<QuestionsData | null> {
  try {
    const res = await fetch(`${BASE}katalog.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const catalog = (await res.json()) as Catalog;
    const prev = await fetch(`${BASE}antworten_bisher.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    return { catalog, questions: questionsFrom(catalog), previous: prev as QuestionsData['previous'], image: (bild) => BASE + bild };
  } catch {
    return null;
  }
}

/** Gespeicherte Antworten; beim ersten Öffnen mit `antworten_bisher.json` vorbelegt. */
export async function loadAnswers(store: Store, data: QuestionsData): Promise<Map<string, Answer>> {
  const saved = new Map(((await store.getMeta<Answer[]>(ANSWERS_KEY)) ?? []).map((a) => [a.id, a]));
  if (await store.getMeta<boolean>(PREFILLED_KEY)) return saved;
  const filled = prefill(saved, data.previous);
  await store.setMeta(ANSWERS_KEY, [...filled.values()]);
  await store.setMeta(PREFILLED_KEY, true);
  return filled;
}

export interface QuestionsInput {
  store: Store;
  data: QuestionsData;
  back: () => void;
  closeButton: (onclick: () => void) => HTMLElement;
  saveFile: (name: string, type: string, content: string) => Promise<boolean>;
}

type View = 'open' | 'all';

function originalBlock(o: Original): HTMLElement {
  const hits = new Set(o.lines.map((l) => l.n));
  const rows = (o.ctx.length > 0 ? o.ctx : o.lines).map((l) =>
    h('div', { class: `oline${l.hit || hits.has(l.n) ? ' hit' : ''}` }, h('span', { class: 'ln' }, String(l.n)), h('span', {}, l.t)),
  );
  const where = `${o.src}, Zeile ${o.lines.map((l) => l.n).join(', ')}`;
  return h('div', { class: 'original' }, h('div', { class: 'label' }, `Dein Original · ${where}`), ...rows);
}

function imageBlock(src: string): HTMLElement {
  const img = h('img', { src, alt: 'Screenshot zur Frage', loading: 'lazy' });
  const wrap = h('button', { type: 'button', class: 'shot', title: 'Vergrößern' }, img);
  wrap.onclick = () => wrap.classList.toggle('zoom');
  return wrap;
}

function entryLine(label: string, fr?: string, de?: string, dir?: string): HTMLElement | null {
  if (!fr && !de) return null;
  return h('p', { class: 'entry' }, h('span', { class: 'muted small' }, label), h('b', { lang: 'fr' }, fr ?? ''), de ? ` = ${de}` : '', dir ? h('span', { class: 'muted small' }, ` · ${dir}`) : null);
}

export async function questionsPage(input: QuestionsInput): Promise<void> {
  const { store, data } = input;
  const answers = await loadAnswers(store, data);
  const groups = data.catalog.gruppen;
  let view: View = 'open';
  let group = '';
  let index = 0;
  let draft: Answer | null = null;
  let error = '';
  /** Fragen, die in dieser Sitzung übersprungen wurden (kommen am Ende der offenen Liste). */
  const skipped = new Set<string>();

  const list = () => {
    const base = data.questions.filter((q) => !group || q.group === group);
    if (view === 'all') return base;
    const open = base.filter((q) => !answers.has(q.id));
    return [...open.filter((q) => !skipped.has(q.id)), ...open.filter((q) => skipped.has(q.id))];
  };

  const persistAnswers = () => store.setMeta(ANSWERS_KEY, [...answers.values()]);

  const exportFile = async () => {
    const json = JSON.stringify(exportAnswers(answers.values()), null, 1);
    const name = `rueckfragen_antworten_${new Date().toISOString().slice(0, 10)}.json`;
    if (await input.saveFile(name, 'application/json', json)) await store.setMeta('rueckfragen:exportiertAm', new Date().toISOString());
  };

  const close = () => {
    document.removeEventListener('keydown', onKey);
    input.back();
  };

  const go = (delta: number) => {
    const n = list().length;
    if (n === 0) return;
    index = (index + delta + n) % n;
    draft = null;
    error = '';
    render();
  };

  const save = async () => {
    const q = list()[index];
    if (!q || !draft) return;
    const problem = validate(q, draft);
    if (problem) {
      error = problem;
      return render();
    }
    answers.set(q.id, { ...draft, text: draft.text.trim(), ts: Date.now() });
    skipped.delete(q.id);
    await persistAnswers();
    draft = null;
    error = '';
    // In „Offen“ rückt die nächste Frage automatisch auf diesen Platz.
    if (view === 'all') index = Math.min(index + 1, list().length - 1);
    else index = Math.min(index, Math.max(0, list().length - 1));
    render();
  };

  /** „Nicht aufnehmen“ (Begag) bzw. Antwort zurücknehmen: Frage gilt wieder als unbeantwortet. */
  const clear = async () => {
    const q = list()[index];
    if (!q) return;
    answers.delete(q.id);
    await persistAnswers();
    draft = null;
    error = '';
    if (view === 'open') index = Math.min(index, Math.max(0, list().length - 1));
    else go(1);
    render();
  };

  const skip = () => {
    const q = list()[index];
    if (q && view === 'open') skipped.add(q.id);
    if (view === 'open') {
      draft = null;
      error = '';
      index = Math.min(index, list().length - 1);
      return render();
    }
    go(1);
  };

  const answerArea = (q: Question, a: Answer): HTMLElement => {
    const rerender = () => render();
    const delToggle = h(
      'label',
      { class: `del-toggle${a.del ? ' on' : ''}` },
      h('input', {
        type: 'checkbox',
        checked: a.del,
        onchange: (ev: Event) => {
          a.del = (ev.target as HTMLInputElement).checked;
          rerender();
        },
      }),
      'Eintrag streichen',
    );
    const textField = (placeholder: string) => {
      const t = h('textarea', { rows: 2, placeholder, value: a.text });
      t.oninput = () => (a.text = t.value);
      return t;
    };
    const verdictButtons = (extra: HTMLElement[] = []) =>
      h(
        'div',
        { class: 'verdicts' },
        ...(VERDICTS[q.group] ?? []).map((v) =>
          h('button', {
            type: 'button',
            className: `chip big${a.verdict === v.value && !a.del ? ' on' : ''}`,
            textContent: v.label,
            onclick: () => {
              a.verdict = a.verdict === v.value ? '' : v.value;
              a.del = false;
              rerender();
            },
          }),
        ),
        ...extra,
      );

    switch (q.group) {
      case 'singles':
        return h(
          'div',
          { class: 'answer' },
          h('div', { class: 'label' }, q.multi ? 'Zutreffendes wählen (mehrere möglich)' : 'Eine Fassung wählen'),
          ...(q.opts ?? []).map((opt, i) => {
            const on = a.picks.includes(opt);
            return h(
              'button',
              {
                type: 'button',
                className: `opt${on ? ' on' : ''}${(q.cur ?? []).includes(i) ? ' cur' : ''}`,
                onclick: () => {
                  a.picks = q.multi ? (on ? a.picks.filter((p) => p !== opt) : [...a.picks, opt]) : on ? [] : [opt];
                  a.del = false;
                  rerender();
                },
              },
              h('span', { class: 'box' }, on ? '✓' : String(i + 1)),
              h('span', {}, opt),
              (q.cur ?? []).includes(i) ? h('span', { class: 'muted small' }, ' steht jetzt in der Liste') : null,
            );
          }),
          textField('Eigene Fassung (optional), z. B. „mot (m) = Wort“'),
          delToggle,
        );
      case 'g1':
        return h(
          'div',
          { class: 'answer' },
          h('div', { class: 'label' }, `Welche Bedeutungen sollen raus? (${q.side === 'fr' ? 'französische' : 'deutsche'} Seite) – nichts gewählt = alle bleiben`),
          h(
            'div',
            { class: 'chips' },
            ...(q.chips ?? []).map((c) => {
              const out = a.removed.includes(c);
              return h('button', {
                type: 'button',
                className: `chip big${out ? ' removed' : ''}`,
                textContent: c,
                lang: q.side === 'fr' ? 'fr' : 'de',
                onclick: () => {
                  a.removed = out ? a.removed.filter((x) => x !== c) : [...a.removed, c];
                  rerender();
                },
              });
            }),
          ),
          delToggle,
        );
      case 'g2':
        return h('div', { class: 'answer' }, verdictButtons(), a.verdict === 'falsch' ? textField('Richtige Fassung') : null, delToggle);
      case 'g3':
        return h('div', { class: 'answer' }, textField('Wie geht es weiter?'), verdictButtons(), delToggle);
      case 'g7':
        return h(
          'div',
          { class: 'answer' },
          verdictButtons([h('button', { type: 'button', className: 'chip big', textContent: 'Nicht aufnehmen', onclick: () => void clear() })]),
          textField('Eigene Bedeutung (optional)'),
        );
      default:
        return h(
          'div',
          { class: 'answer' },
          verdictButtons([
            h('button', {
              type: 'button',
              className: `chip big del${a.del ? ' on' : ''}`,
              textContent: 'Streichen',
              onclick: () => {
                a.del = !a.del;
                if (a.del) a.verdict = '';
                rerender();
              },
            }),
          ]),
          textField(q.group === 'g5' ? 'Richtige Bedeutung (optional)' : 'Korrektur (optional)'),
        );
    }
  };

  const questionBody = (q: Question): HTMLElement[] => {
    const parts: (HTMLElement | null)[] = [];
    switch (q.group) {
      case 'singles':
        parts.push(h('p', { class: 'question' }, q.q ?? ''), entryLine('Jetzt in der Liste: ', q.fr, q.de, q.dir));
        break;
      case 'g1':
        parts.push(h('p', { class: 'question' }, h('b', {}, q.title ?? ''), h('span', { class: 'muted small' }, ` · ${q.dir ?? ''}`)));
        break;
      case 'g2':
        parts.push(
          h('p', { class: 'question' }, 'Deine Notiz ', h('b', { lang: 'fr' }, q.jan ?? ''), ' habe ich so aufgelöst:'),
          h('p', { class: 'resolved', lang: 'fr' }, q.res ?? ''),
        );
        break;
      case 'g3':
        parts.push(
          h('p', { class: 'question' }, 'Die Zeile bricht ab: ', h('b', { lang: 'fr' }, q.jan ?? '')),
          h('p', { class: 'resolved' }, h('span', { class: 'muted small' }, 'Angesetzt: '), q.res ?? ''),
        );
        break;
      case 'g4':
        parts.push(h('p', { class: 'question' }, 'Aus einem englischen Lexikon übernommen – behalten?'), entryLine('', q.fr, q.de, q.dir));
        break;
      case 'g5':
        parts.push(h('p', { class: 'question' }, 'Von der Chat-Sitzung ergänzt – passt das?'), entryLine('', q.fr, q.de, q.dir));
        break;
      case 'g6':
        parts.push(h('p', { class: 'question' }, 'Neu aus den Vocs, steht schon in der Liste – behalten?'), entryLine('', q.fr, q.de, q.dir), q.n ? h('p', { class: 'muted small' }, q.n) : null);
        break;
      case 'g7':
        parts.push(h('p', { class: 'question' }, 'Annotation zum Begag-Text – in die Liste aufnehmen?'), entryLine('', q.fr, q.de));
        break;
    }
    if (q.q0) parts.push(h('p', { class: 'muted small source' }, `Quelle: ${q.q0}`));
    return parts.filter(Boolean) as HTMLElement[];
  };

  const render = () => {
    const items = list();
    const answered = data.questions.filter((q) => answers.has(q.id)).length;
    const total = data.questions.length;
    if (index >= items.length) index = Math.max(0, items.length - 1);
    const q = items[index];
    if (q && !draft) draft = draftFor(q, answers.get(q.id));

    const fill = h('div', { class: 'fill' });
    fill.style.width = `${(100 * answered) / total}%`;
    const select = h(
      'select',
      {
        ariaLabel: 'Gruppe',
        onchange: (ev: Event) => {
          group = (ev.target as HTMLSelectElement).value;
          index = 0;
          draft = null;
          render();
        },
      },
      h('option', { value: '', textContent: 'Alle Gruppen' }),
      ...Object.keys(groups)
        .filter((g) => data.questions.some((x) => x.group === g))
        .map((g) => {
          const open = data.questions.filter((x) => x.group === g && !answers.has(x.id)).length;
          return h('option', { value: g, textContent: `${groups[g]} (${open} offen)`, selected: g === group });
        }),
    );

    const head = [
      h(
        'div',
        { class: 'bar' },
        input.closeButton(close),
        h('div', { class: 'meter' }, h('div', { class: 'track' }, fill), h('div', { class: 'count' }, h('span', {}, `${answered} von ${total} beantwortet`), h('span', {}, `${total - answered} offen`))),
        h('button', { class: 'icon export', title: 'Antworten exportieren', ariaLabel: 'Antworten exportieren', textContent: '⤓', onclick: () => void exportFile() }),
      ),
      h(
        'div',
        { class: 'q-filters' },
        h(
          'div',
          { class: 'segmented two' },
          ...(['open', 'all'] as View[]).map((v) =>
            h('button', {
              textContent: v === 'open' ? 'Offen' : 'Alle',
              className: v === view ? 'on' : '',
              onclick: () => {
                view = v;
                index = 0;
                draft = null;
                render();
              },
            }),
          ),
        ),
        select,
      ),
    ];

    if (!q || !draft) {
      show(
        ...head,
        h(
          'div',
          { class: 'end' },
          h('div', { class: 'panel' }, h('b', {}, String(answered)), h('p', { class: 'muted' }, group ? 'In dieser Gruppe ist alles beantwortet.' : 'Alle Rückfragen sind beantwortet.')),
          h('button', { class: 'primary', textContent: `Antworten exportieren (${answered})`, onclick: () => void exportFile() }),
          h('p', { class: 'muted small' }, 'Die Datei an die Chat-Sitzung geben, die die Vokabelliste pflegt.'),
        ),
      );
      return;
    }

    const a = draft;
    const done = answers.has(q.id);
    show(
      ...head,
      h(
        'article',
        { class: 'panel qcard' },
        h('div', { class: 'qhead' }, h('span', { class: 'tag' }, groups[q.group] ?? q.group), done ? h('span', { class: 'tag done' }, 'beantwortet') : null, h('span', { class: 'muted small' }, `${index + 1} / ${items.length} · ${q.id}`)),
        ...questionBody(q),
        q.original ? originalBlock(q.original) : null,
        q.bild ? imageBlock(data.image(q.bild)) : null,
        answerArea(q, a),
        error ? h('p', { class: 'err', role: 'alert' }, error) : null,
      ),
      h(
        'div',
        { class: 'q-actions' },
        h('button', { textContent: '←', ariaLabel: 'Vorherige Frage', onclick: () => go(-1) }),
        h('button', { textContent: 'Überspringen', onclick: skip }),
        h('button', { class: 'primary', textContent: done ? 'Ändern & weiter' : 'Speichern & weiter', onclick: () => void save() }),
      ),
      ...(done ? [h('button', { class: 'link-button undo-answer', textContent: 'Antwort zurücknehmen', onclick: () => void clear() })] : []),
    );
  };

  const onKey = (ev: KeyboardEvent) => {
    const typing = ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement;
    if (ev.key === 'Escape') return close();
    if (typing) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void save();
    } else if (ev.key === 'ArrowRight') skip();
    else if (ev.key === 'ArrowLeft') go(-1);
    else if (/^[1-9]$/.test(ev.key)) (document.querySelectorAll<HTMLButtonElement>('.answer .opt, .answer .chips .chip, .answer .verdicts .chip')[Number(ev.key) - 1])?.click();
  };
  document.addEventListener('keydown', onKey);
  render();
}
