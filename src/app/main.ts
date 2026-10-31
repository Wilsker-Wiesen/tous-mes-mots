// Oberfläche (Vanilla TS). Lernlogik und Daten liegen in src/core und src/storage.

import './style.css';
import { frSegments, meaningLines } from '../core/display.ts';
import { buildQueue, Session, type QueueEntry } from '../core/queue.ts';
import { activeStates, statesToDelete } from '../core/reconcile.ts';
import { createPlanner, formatInterval, type Planner } from '../core/scheduler.ts';
import { newId, type CardState, type Grade, type Settings } from '../core/state.ts';
import type { CardsFile, Direction } from '../core/types.ts';
import { openStore, type Store } from '../storage/db.ts';

declare const __APP_VERSION__: string;

/** Schritt 2: nur Erkennen. Produktionsrichtung folgt in Schritt 3. */
const DIRECTIONS: Direction[] = ['fr-de'];
const GRADES: { grade: Grade; label: string }[] = [
  { grade: 1, label: 'Nochmal' },
  { grade: 2, label: 'Schwer' },
  { grade: 3, label: 'Gut' },
  { grade: 4, label: 'Leicht' },
];

const root = document.getElementById('app')!;

type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  for (const c of children) if (c) el.append(c);
  return el;
}

function show(...nodes: Node[]): void {
  root.replaceChildren(...nodes);
}

interface App {
  file: CardsFile;
  store: Store;
  planner: Planner;
  settings: Settings;
  states: Map<string, CardState>;
}

/** Schreibvorgänge nacheinander ausführen, ohne die Oberfläche warten zu lassen. */
let writes: Promise<void> = Promise.resolve();
function persist(task: () => Promise<void>): void {
  writes = writes.then(task).catch((err: unknown) => {
    console.error(err);
    alert(`Speichern fehlgeschlagen: ${String(err)}`);
  });
}

async function boot(): Promise<void> {
  let file: CardsFile;
  try {
    const res = await fetch('./data/cards.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    file = (await res.json()) as CardsFile;
  } catch {
    show(
      h(
        'div',
        { class: 'home' },
        h('h1', {}, 'Tous mes mots'),
        h(
          'div',
          { class: 'error' },
          h('p', {}, 'Keine Wortliste gefunden. Im Projektordner einmal den Import ausführen:'),
          h('code', {}, 'npm run import'),
        ),
      ),
    );
    return;
  }
  const store = await openStore();
  const all = await store.allStates();
  const stale = statesToDelete(all, file);
  if (stale.length > 0) await store.deleteStates(stale);
  const settings = await store.getSettings();
  const planner = await createPlanner(settings);
  home({ file, store, planner, settings, states: activeStates(all, file) });
}

function home(app: App): void {
  const now = new Date();
  const { entries, summary } = buildQueue({ ...app, items: app.file.items, now, directions: DIRECTIONS });

  const newOut = h('output', {}, String(app.settings.newPerDay));
  const step = (delta: number) =>
    h('button', {
      textContent: delta > 0 ? '+' : '−',
      ariaLabel: delta > 0 ? 'Mehr neue Karten' : 'Weniger neue Karten',
      onclick: () => {
        app.settings = { ...app.settings, newPerDay: Math.min(200, Math.max(0, app.settings.newPerDay + delta)) };
        persist(() => app.store.setSettings(app.settings));
        home(app);
      },
    });

  const start = h('button', {
    class: 'primary',
    textContent: entries.length > 0 ? `Abfrage starten (${entries.length})` : 'Für heute alles erledigt',
    disabled: entries.length === 0,
    onclick: () => quiz(app, new Session(entries, app.states, app.planner, newId())),
  });

  const stat = (n: number, label: string, lead = false) =>
    h('div', { class: `stat${lead ? ' lead' : ''}` }, h('b', {}, String(n)), h('span', { class: 'muted small' }, label));

  show(
    h(
      'div',
      { class: 'home' },
      h(
        'div',
        { class: 'brand' },
        tileTitle('Tous mes mots'),
        h('p', { class: 'muted small' }, 'Französisch → Deutsch'),
      ),
      h('div', { class: 'panel stats' }, stat(summary.due, 'fällig', summary.due > 0), stat(summary.newAvailable, 'neu'), stat(app.states.size, 'gelernt')),
      start,
      h(
        'div',
        { class: 'panel settings' },
        h(
          'div',
          { class: 'setting' },
          h('span', {}, 'Neue Karten pro Tag', h('br'), h('span', { class: 'muted small' }, `heute schon ${summary.newToday}`)),
          h('div', { class: 'stepper' }, step(-5), newOut, step(5)),
        ),
      ),
      h(
        'p',
        { class: 'muted small foot' },
        `${app.file.items.length} Einträge · Import vom ${new Date(app.file.generatedAt).toLocaleDateString('de-DE')} · v${__APP_VERSION__}`,
      ),
    ),
  );
  start.focus();
}

/** Überschrift im Stil des App-Symbols: ein Plättchen pro Buchstabe, Anfangsbuchstaben violett. */
function tileTitle(text: string): HTMLElement {
  const words = text.toUpperCase().split(' ');
  return h(
    'h1',
    { class: 'tiles', ariaLabel: text },
    ...words.map((w) =>
      h('span', { class: 'word', ariaHidden: 'true' }, ...[...w].map((ch, i) => h('span', { class: i === 0 ? 'tile first' : 'tile' }, ch))),
    ),
  );
}

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
};

function iconButton(icon: keyof typeof ICONS, label: string, onclick: () => void, disabled = false): HTMLButtonElement {
  const b = h('button', { class: 'icon', title: label, ariaLabel: label, onclick, disabled });
  b.innerHTML = ICONS[icon];
  return b;
}

function withContext(text: string): (Node | string)[] {
  return frSegments(text).map((s) => (s.note ? h('span', { class: 'ctx' }, s.text) : s.text));
}

function front(entry: QueueEntry): HTMLElement {
  const hideGender = entry.direction === 'de-fr';
  const text = entry.direction === 'fr-de' ? entry.item.fr : entry.item.de;
  const segs = entry.direction === 'fr-de' ? frSegments(text, { hideGender }) : [{ text, note: false }];
  return h('div', { class: 'front', lang: entry.direction === 'fr-de' ? 'fr' : 'de' }, ...segs.map((s) => (s.note ? h('span', { class: 'note' }, s.text) : s.text)));
}

function back(entry: QueueEntry): HTMLElement {
  const { item } = entry;
  const lines = meaningLines(item.de);
  const meanings = lines.filter((l) => !l.example);
  const examples = lines.filter((l) => l.example);
  return h(
    'div',
    { class: 'back', lang: 'de', onclick: (ev: Event) => ev.stopPropagation() },
    h('div', { class: 'label' }, 'Deutsch'),
    h(
      'ul',
      { class: 'meanings' },
      ...meanings.map((l, i) =>
        h('li', { class: i === 0 ? 'main' : '' }, l.num !== null && h('span', { class: 'num' }, String(l.num)), h('span', {}, ...withContext(l.text))),
      ),
    ),
    examples.length > 0 &&
      h(
        'div',
        { class: 'examples' },
        ...examples.map((l) => {
          const [fr, ...de] = l.text.split(/\s=\s/u);
          return h('div', { class: 'example' }, h('i', { lang: 'fr' }, fr ?? ''), ' = ', ...withContext(de.join(' = ')));
        }),
      ),
    item.notiz && h('details', { class: 'notiz', open: item.expression }, h('summary', {}, 'Notiz'), h('p', {}, item.notiz)),
  );
}

function quiz(app: App, session: Session): void {
  let entry: QueueEntry | null = null;
  let shownAt = new Date();
  let revealedAt: Date | null = null;

  const finish = () => {
    document.removeEventListener('keydown', onKey);
    show(
      h(
        'div',
        { class: 'end' },
        h('div', { class: 'panel' }, h('b', {}, String(session.done)), h('p', { class: 'muted' }, session.done === 1 ? 'Karte bewertet' : 'Karten bewertet')),
        h('button', { class: 'primary', textContent: 'Zur Übersicht', onclick: () => home(app) }),
      ),
    );
  };

  const rate = (grade: Grade) => {
    if (!entry || !revealedAt) return;
    const { state, event } = session.answer({ grade, now: new Date(), shownAt, revealedAt, appVersion: __APP_VERSION__ });
    persist(() => app.store.record(state, event));
    next();
  };

  const undo = () => {
    const u = session.undo();
    if (!u) return;
    persist(() => app.store.revert(u.cardId, u.prev, { kind: 'undo', id: newId(), ts: new Date().toISOString(), targetId: u.eventId }));
    entry = session.current;
    revealedAt = null;
    shownAt = new Date();
    render();
  };

  const reveal = () => {
    if (!entry || revealedAt) return;
    revealedAt = new Date();
    render();
  };

  const next = () => {
    entry = session.next(new Date());
    if (!entry) return finish();
    shownAt = new Date();
    revealedAt = null;
    render();
  };

  const render = () => {
    if (!entry) return;
    const e = entry;
    const tags = [
      e.item.expression && h('span', { class: 'tag' }, 'Wendung'),
      revealedAt && e.item.sicherheit === 'eigen?' && h('span', { class: 'tag warn', title: 'Bedeutung in der Liste als unsicher markiert' }, 'Bedeutung unsicher'),
    ].filter(Boolean) as HTMLElement[];

    const card = h(
      'div',
      { class: `card${revealedAt ? ' revealed' : ''}`, onclick: reveal },
      h('div', { class: 'face' }, tags.length > 0 && h('div', { class: 'tags' }, ...tags), front(e)),
      revealedAt && back(e),
    );

    let actions: HTMLElement;
    if (!revealedAt) {
      actions = h('div', { class: 'actions reveal' }, h('button', { class: 'primary', textContent: 'Aufdecken', onclick: reveal }));
    } else {
      const due = app.planner.preview(session.stateOf(e), new Date());
      const now = new Date();
      actions = h(
        'div',
        { class: 'actions grades' },
        ...GRADES.map(({ grade, label }) =>
          h('button', { class: `g${grade}`, onclick: () => rate(grade) }, label, h('small', {}, formatInterval(now, due[grade]))),
        ),
      );
    }

    const total = session.done + session.remaining;
    const fill = h('div', { class: 'fill' });
    fill.style.width = `${total ? (100 * session.done) / total : 0}%`;
    const undoButton = iconButton('undo', 'Rückgängig (Z)', undo, !session.canUndo);
    undoButton.classList.add('undo');
    undoButton.append(h('span', {}, 'Rückgängig'));
    show(
      h(
        'div',
        { class: 'bar' },
        iconButton('close', 'Sitzung beenden (Esc)', finish),
        h(
          'div',
          { class: 'meter' },
          h('div', { class: 'track' }, fill),
          h('div', { class: 'count' }, h('span', {}, `${session.done} erledigt`), h('span', {}, `${session.remaining} offen`)),
        ),
        undoButton,
      ),
      h('div', { class: 'deck' }, card),
      actions,
    );
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      reveal();
    } else if (/^[1-4]$/.test(ev.key)) {
      rate(Number(ev.key) as Grade);
    } else if (ev.key === 'z' || ev.key === 'Backspace') {
      undo();
    } else if (ev.key === 'Escape') {
      finish();
    }
  };
  document.addEventListener('keydown', onKey);
  next();
}

boot().catch((err: unknown) => {
  console.error(err);
  show(h('div', { class: 'error' }, `Fehler beim Start: ${String(err)}`));
});
