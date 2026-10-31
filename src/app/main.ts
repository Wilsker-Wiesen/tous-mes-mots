// Oberfläche (Vanilla TS). Lernlogik und Daten liegen in src/core und src/storage.

import './style.css';
import { frSegments, meaningLines } from '../core/display.ts';
import { buildQueue, Session, type QueueEntry } from '../core/queue.ts';
import { activeStates, statesToDelete } from '../core/reconcile.ts';
import { createPlanner, formatInterval, type Planner } from '../core/scheduler.ts';
import { newId, type CardState, type Settings } from '../core/state.ts';
import type { CardsFile, Direction } from '../core/types.ts';
import { openStore, type Store } from '../storage/db.ts';

declare const __APP_VERSION__: string;

/** Schritt 2: nur Erkennen. Produktionsrichtung folgt in Schritt 3. */
const DIRECTIONS: Direction[] = ['fr-de'];
/** Wischweg, ab dem eine Wischgeste als Antwort zählt (px). */
const SWIPE_PX = 90;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const queue = buildQueue({ ...app, items: app.file.items, now, directions: DIRECTIONS });
  const { summary } = queue;
  const available = queue.due.length + (queue.newBudget > 0 ? queue.fresh.length : 0);

  const newOut = h('output', {}, String(app.settings.newPerDay));
  const step = (delta: number) =>
    h('button', {
      textContent: delta > 0 ? '+' : '−',
      ariaLabel: delta > 0 ? 'Mehr unbekannte Wörter pro Tag' : 'Weniger unbekannte Wörter pro Tag',
      onclick: () => {
        app.settings = { ...app.settings, newPerDay: Math.min(200, Math.max(0, app.settings.newPerDay + delta)) };
        persist(() => app.store.setSettings(app.settings));
        home(app);
      },
    });

  const start = h('button', {
    class: 'primary',
    textContent: available > 0 ? 'Abfrage starten' : 'Für heute alles erledigt',
    disabled: available === 0,
    onclick: () => quiz(app),
  });

  const stat = (n: number, label: string, lead = false) =>
    h('div', { class: `stat${lead ? ' lead' : ''}` }, h('b', {}, n.toLocaleString('de-DE')), h('span', { class: 'muted small' }, label));

  show(
    h(
      'div',
      { class: 'home' },
      h('div', { class: 'brand' }, tileTitle('Tous mes mots'), h('p', { class: 'muted small' }, 'Französisch → Deutsch')),
      h(
        'div',
        { class: 'panel stats' },
        stat(summary.due, 'fällig', summary.due > 0),
        stat(summary.unsorted, 'unsortiert'),
        stat(summary.retired, 'gewusst'),
      ),
      start,
      h(
        'div',
        { class: 'panel settings' },
        h(
          'div',
          { class: 'setting' },
          h(
            'span',
            {},
            'Neue Lernwörter pro Tag',
            h('br'),
            h('span', { class: 'muted small' }, `heute ${summary.newToday} · nur nicht gewusste zählen`),
          ),
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

function quiz(app: App): void {
  const queue = buildQueue({ ...app, items: app.file.items, now: new Date(), directions: DIRECTIONS });
  const session = new Session(queue, app.states, app.planner, app.settings.sessionSize, newId());
  let entry: QueueEntry | null = null;
  let shownAt = new Date();
  let revealedAt: Date | null = null;
  let busy = false;
  let cardEl: HTMLElement | null = null;

  const finish = () => {
    document.removeEventListener('keydown', onKey);
    const more = buildQueue({ ...app, items: app.file.items, now: new Date(), directions: DIRECTIONS });
    const left = more.due.length + (more.newBudget > 0 ? more.fresh.length : 0);
    show(
      h(
        'div',
        { class: 'end' },
        h('div', { class: 'panel' }, h('b', {}, String(session.done)), h('p', { class: 'muted' }, session.done === 1 ? 'Karte' : 'Karten')),
        left > 0 && h('button', { class: 'primary', textContent: 'Weiter', onclick: () => quiz(app) }),
        h('button', { textContent: 'Zur Übersicht', onclick: () => home(app) }),
      ),
    );
  };

  /** Karte kurz zur Seite gleiten lassen, dann antworten. */
  const answer = (known: boolean) => {
    if (!entry || !revealedAt || busy) return;
    const { state, event } = session.answer({ known, now: new Date(), shownAt, revealedAt, appVersion: __APP_VERSION__ });
    persist(() => app.store.record(state, event));
    if (cardEl && !reducedMotion()) {
      busy = true;
      const dx = known ? 1 : -1;
      cardEl
        .animate([{ transform: cardEl.style.transform || 'none' }, { transform: `translateX(${dx * 120}%) rotate(${dx * 8}deg)`, opacity: 0 }], {
          duration: 160,
          easing: 'ease-in',
          fill: 'forwards',
        })
        .finished.then(() => {
          busy = false;
          next();
        });
    } else {
      next();
    }
  };

  const undo = () => {
    if (busy) return;
    const u = session.undo();
    if (!u) return;
    persist(() => app.store.revert(u.cardId, u.prev, { kind: 'undo', id: newId(), ts: new Date().toISOString(), targetId: u.eventId }));
    entry = session.current;
    revealedAt = null;
    shownAt = new Date();
    render();
  };

  /** Karte umdrehen: halbe Drehung, Rückseite einsetzen, zurückdrehen. */
  const flip = () => {
    if (!entry || revealedAt || busy) return;
    revealedAt = new Date();
    if (!cardEl || reducedMotion()) return render();
    busy = true;
    cardEl.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
      render();
      cardEl?.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], { duration: 130, easing: 'ease-out' }).finished.then(() => (busy = false));
    });
  };

  const next = () => {
    entry = session.next(new Date());
    if (!entry) return finish();
    shownAt = new Date();
    revealedAt = null;
    render();
  };

  /** Wischen auf der umgedrehten Karte: rechts = gewusst, links = nicht gewusst. */
  const swipe = (el: HTMLElement) => {
    let x0: number | null = null;
    let id = -1;
    el.addEventListener('pointerdown', (ev) => {
      if (!revealedAt || busy) return;
      x0 = ev.clientX;
      id = ev.pointerId;
      el.setPointerCapture(id);
    });
    el.addEventListener('pointermove', (ev) => {
      if (x0 === null || ev.pointerId !== id) return;
      const dx = ev.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
      el.dataset.lean = dx > SWIPE_PX / 2 ? 'known' : dx < -SWIPE_PX / 2 ? 'unknown' : '';
    });
    const end = (ev: PointerEvent) => {
      if (x0 === null || ev.pointerId !== id) return;
      const dx = ev.clientX - x0;
      x0 = null;
      if (Math.abs(dx) >= SWIPE_PX) return answer(dx > 0);
      el.style.transform = '';
      el.dataset.lean = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  const label = (from: Date, to: Date | { from: Date; to: Date }) =>
    to instanceof Date ? `wieder in ${formatInterval(from, to)}` : `erst in ${formatInterval(from, to.from)} – ${formatInterval(from, to.to)}`;

  const render = () => {
    if (!entry) return;
    const e = entry;
    const tags = [
      e.item.expression && h('span', { class: 'tag' }, 'Wendung'),
      revealedAt && e.item.sicherheit === 'eigen?' && h('span', { class: 'tag warn', title: 'Bedeutung in der Liste als unsicher markiert' }, 'Bedeutung unsicher'),
    ].filter(Boolean) as HTMLElement[];

    cardEl = h(
      'div',
      { class: `card${revealedAt ? ' revealed' : ''}`, onclick: flip },
      h('div', { class: 'face' }, tags.length > 0 && h('div', { class: 'tags' }, ...tags), front(e)),
      revealedAt && back(e),
    );
    swipe(cardEl);

    let actions: HTMLElement;
    if (!revealedAt) {
      actions = h('div', { class: 'actions hint muted' }, 'Karte antippen zum Umdrehen');
    } else {
      const now = new Date();
      const p = app.planner.preview(session.stateOf(e), now);
      actions = h(
        'div',
        { class: 'actions answers' },
        h('button', { class: 'unknown', onclick: () => answer(false) }, 'Wusste ich nicht', h('small', {}, label(now, p.unknown))),
        h('button', { class: 'known', onclick: () => answer(true) }, 'Wusste ich', h('small', {}, label(now, p.known))),
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
      h('div', { class: 'deck' }, cardEl),
      actions,
    );
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      flip();
    } else if (ev.key === 'ArrowLeft' || ev.key === '1') {
      answer(false);
    } else if (ev.key === 'ArrowRight' || ev.key === '2') {
      answer(true);
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
