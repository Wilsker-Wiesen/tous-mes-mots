// Oberfläche (Vanilla TS). Lernlogik und Daten liegen in src/core und src/storage.

import './style.css';
import { h, show } from './dom.ts';
import { dataPage, LAST_BACKUP_KEY, saveFile } from './data-view.ts';
import { loadAppData } from './data-source.ts';
import { listenPage } from './listen-view.ts';
import { setClipSource } from './speech.ts';
import type { AudioManifest } from '../core/audio.ts';
import { questionsListenPage } from './questions-listen-view.ts';
import { loadAnswers, questionsPage, type QuestionsData } from './questions-view.ts';
import { statsPage } from './stats-view.ts';
import { frSegments, meaningLines } from '../core/display.ts';
import { REPORT_REASONS, type Report, type ReportReason } from '../core/backup.ts';
import { filterItems } from '../core/filter.ts';
import { matchesAnswer } from '../core/normalize.ts';
import { buildRound, gameEvent, gamePool, pullForward, SPRINT_SECONDS, SUDDEN_SECONDS_PER_WORD, type GameMode, type Round } from '../core/game.ts';
import { buildQueue, Session, type QueueEntry } from '../core/queue.ts';
import { activeStates, statesToDelete } from '../core/reconcile.ts';
import { createPlanner, formatInterval, type Planner } from '../core/scheduler.ts';
import { newId, type CardState, type Settings } from '../core/state.ts';
import type { CardsFile, Direction } from '../core/types.ts';
import { openStore, type Store } from '../storage/db.ts';

declare const __APP_VERSION__: string;

const DIRECTION_CHOICES: { label: string; directions: Direction[] }[] = [
  { label: 'FR → DE', directions: ['fr-de'] },
  { label: 'DE → FR', directions: ['de-fr'] },
  { label: 'Beide', directions: ['fr-de', 'de-fr'] },
];
const DIRECTION_TEXT: Record<string, string> = {
  'fr-de': 'Französisch → Deutsch',
  'de-fr': 'Deutsch → Französisch',
  'fr-de,de-fr': 'Beide Richtungen',
};
/** Lemmasuche gilt nur für die laufende Nutzung, wird nicht gespeichert. */
let search = '';
/** Wischweg, ab dem eine Wischgeste als Antwort zählt (px). */
const SWIPE_PX = 90;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface App {
  file: CardsFile;
  store: Store;
  planner: Planner;
  settings: Settings;
  states: Map<string, CardState>;
  /** Einträge mit offener Meldung. */
  reported: Set<string>;
  lastBackup: string | undefined;
  /** Rückfragenkatalog, falls auf diesem Gerät vorhanden. */
  questions: QuestionsData | null;
  openQuestions: number;
  audio: AudioManifest | null;
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
  const store = await openStore();
  const data = await loadAppData(store);
  if (!data) {
    show(
      h(
        'div',
        { class: 'home' },
        h('h1', {}, 'Tous mes mots'),
        h(
          'div',
          { class: 'error' },
          h('p', {}, 'Keine Wortliste gefunden. Im Projektordner ausführen:'),
          h('code', {}, 'npm run daten'),
        ),
      ),
    );
    return;
  }
  const { file, questions, audio } = data;
  const all = await store.allStates();
  const stale = statesToDelete(all, file);
  if (stale.length > 0) await store.deleteStates(stale);
  const settings = await store.getSettings();
  const planner = await createPlanner(settings);
  const [reports, lastBackup] = await Promise.all([store.allReports(), store.getMeta<string>(LAST_BACKUP_KEY)]);
  const app: App = { file, store, planner, settings, states: activeStates(all, file), reported: new Set(reports.map((r) => r.itemId)), lastBackup, questions, openQuestions: 0, audio };
  setClipSource(audio ? (key) => store.getClip(key) : null);
  await countOpenQuestions(app);
  home(app);
}

function queueFor(app: App, now = new Date()) {
  const items = filterItems(app.file.items, { ...app.settings, search });
  return buildQueue({ ...app, items, now, directions: app.settings.directions });
}

function saveSettings(app: App, patch: Partial<Settings>): void {
  app.settings = { ...app.settings, ...patch };
  persist(() => app.store.setSettings(app.settings));
}

function home(app: App): void {
  const now = new Date();
  const queue = queueFor(app, now);
  const { summary } = queue;
  const available = queue.due.length + (queue.newBudget > 0 ? queue.fresh.length : 0);

  const newOut = h('output', {}, String(app.settings.newPerDay));
  const step = (delta: number) =>
    h('button', {
      textContent: delta > 0 ? '+' : '−',
      ariaLabel: delta > 0 ? 'Mehr unbekannte Wörter pro Tag' : 'Weniger unbekannte Wörter pro Tag',
      onclick: () => {
        saveSettings(app, { newPerDay: Math.min(200, Math.max(0, app.settings.newPerDay + delta)) });
        home(app);
      },
    });

  const start = h('button', {
    class: 'primary',
    textContent: available > 0 ? (search ? `Suche abfragen („${search}“)` : 'Abfrage starten') : search ? 'Keine Treffer' : 'Für heute alles erledigt',
    disabled: available === 0,
    onclick: () => quiz(app),
  });

  const stat = (n: number, label: string, lead = false) =>
    h('div', { class: `stat${lead ? ' lead' : ''}` }, h('b', {}, n.toLocaleString('de-DE')), h('span', { class: 'muted small' }, label));

  show(
    h(
      'div',
      { class: 'home' },
      h('div', { class: 'brand' }, tileTitle('Tous mes mots'), h('p', { class: 'muted small' }, DIRECTION_TEXT[app.settings.directions.join(',')] ?? '')),
      h(
        'div',
        { class: 'segmented', role: 'group', ariaLabel: 'Richtung' },
        ...DIRECTION_CHOICES.map((c) =>
          h('button', {
            textContent: c.label,
            className: c.directions.join() === app.settings.directions.join() ? 'on' : '',
            ariaPressed: String(c.directions.join() === app.settings.directions.join()),
            onclick: () => {
              saveSettings(app, { directions: c.directions });
              home(app);
            },
          }),
        ),
      ),
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
        { class: 'games' },
        h('button', { class: 'game-button', onclick: () => game(app, 'sprint') }, h('b', {}, '60 Sekunden'), h('span', { class: 'muted small' }, 'so viele Wörter wie möglich')),
        h('button', { class: 'game-button', onclick: () => game(app, 'sudden') }, h('b', {}, 'Sudden Death'), h('span', { class: 'muted small' }, 'ein Fehler, und es ist vorbei')),
      ),
      h(
        'button',
        { class: 'game-button stats-button listen-button', disabled: available === 0 && !app.questions, onclick: () => openListen(app) },
        h('b', {}, 'Hörmodus'),
        h('span', { class: 'muted small' }, 'freihändig: vorlesen, antworten, weiter'),
      ),
      h(
        'button',
        { class: 'game-button stats-button', onclick: () => openStats(app) },
        h('b', {}, 'Statistik'),
        h('span', { class: 'muted small' }, 'Verlauf, Schwächen, Rekorde'),
      ),
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
      app.questions && questionsButton(app),
      filters(app),
      backupHint(app),
      h(
        'p',
        { class: 'muted small foot' },
        `${app.file.items.length} Einträge · Import vom ${new Date(app.file.generatedAt).toLocaleDateString('de-DE')} · v${__APP_VERSION__}`,
      ),
    ),
  );
  start.focus();
}

async function countOpenQuestions(app: App): Promise<void> {
  if (!app.questions) return;
  const answers = await loadAnswers(app.store, app.questions);
  app.openQuestions = app.questions.questions.filter((q) => !answers.has(q.id)).length;
}

function questionsButton(app: App): HTMLElement {
  return h(
    'button',
    {
      class: 'game-button questions-button',
      onclick: () =>
        void questionsPage({
          store: app.store,
          data: app.questions!,
          back: () => void countOpenQuestions(app).then(() => home(app)),
          closeButton: (onclick) => iconButton('close', 'Zurück zur Übersicht', onclick),
          saveFile,
        }),
    },
    h('b', {}, 'Rückfragen zur Liste'),
    h('span', { class: 'muted small' }, app.openQuestions > 0 ? `noch ${app.openQuestions} offen` : 'alle beantwortet'),
  );
}

const BACKUP_REMIND_DAYS = 7;

/** Fußzeile mit Zugang zur Datenseite; mahnt, wenn die letzte Sicherung zu lange her ist. */
function backupHint(app: App): HTMLElement {
  const days = app.lastBackup ? (Date.now() - Date.parse(app.lastBackup)) / 86_400_000 : Infinity;
  const due = app.states.size > 0 && days > BACKUP_REMIND_DAYS;
  const text = !app.lastBackup ? 'noch keine Sicherung' : `letzte Sicherung vor ${Math.floor(days)} ${Math.floor(days) === 1 ? 'Tag' : 'Tagen'}`;
  return h(
    'button',
    { class: `game-button data-button${due ? ' due' : ''}`, onclick: () => openData(app) },
    h('b', {}, 'Daten & Sicherung'),
    h('span', { class: 'muted small' }, due ? `${text} – jetzt sichern` : text),
  );
}

function openData(app: App): void {
  void dataPage({
    file: app.file,
    store: app.store,
    settings: app.settings,
    states: app.states,
    appVersion: __APP_VERSION__,
    back: () => void reloadApp(app),
    reload: () => void boot(),
    closeButton: (onclick) => iconButton('close', 'Zurück zur Übersicht', onclick),
  });
}

/** Nach Besuch der Datenseite Meldungen und Sicherungsdatum neu lesen. */
async function reloadApp(app: App): Promise<void> {
  const [reports, lastBackup] = await Promise.all([app.store.allReports(), app.store.getMeta<string>(LAST_BACKUP_KEY)]);
  app.reported = new Set(reports.map((r) => r.itemId));
  app.lastBackup = lastBackup;
  home(app);
}

async function openStats(app: App): Promise<void> {
  await writes;
  statsPage({
    items: app.file.items,
    states: app.states,
    events: await app.store.allEvents(),
    desiredRetention: app.settings.desiredRetention,
    back: () => home(app),
    closeButton: (onclick) => iconButton('close', 'Zurück zur Übersicht', onclick),
  });
}

function openListen(app: App): void {
  listenPage({
    session: () => new Session(queueFor(app), app.states, app.planner, app.settings.sessionSize, newId()),
    preview: () => {
      const q = queueFor(app);
      return [...q.due, ...(q.newBudget > 0 ? q.fresh : [])].slice(0, app.settings.sessionSize);
    },
    record: (state, event) => persist(() => app.store.record(state, event)),
    revert: (cardId, prev, undo) => persist(() => app.store.revert(cardId, prev, undo)),
    report: (entry) => {
      const { item } = entry;
      const report: Report = {
        id: newId(),
        ts: new Date().toISOString(),
        itemId: item.id,
        fr: item.fr,
        de: item.de,
        richtung: item.richtung,
        line: item.line,
        sicherheit: item.sicherheit,
        reason: item.sicherheit === 'eigen?' ? 'bedeutung' : 'sonstiges',
        note: 'im Hörmodus gemeldet',
      };
      persist(() => app.store.addReport(report));
      app.reported.add(item.id);
    },
    isReported: (entry) => app.reported.has(entry.item.id),
    newId,
    appVersion: __APP_VERSION__,
    closeButton: (onclick) => iconButton('close', 'Hörmodus beenden', onclick),
    back: () => home(app),
    audio: app.audio && { manifest: app.audio, store: app.store },
    canQuiz: () => { const q = queueFor(app); return q.due.length + (q.newBudget > 0 ? q.fresh.length : 0) > 0; },
    openQuestions: app.questions
      ? () =>
          questionsListenPage({
            store: app.store,
            data: app.questions!,
            closeButton: (onclick) => iconButton('close', 'Hörmodus beenden', onclick),
            back: () => void countOpenQuestions(app).then(() => openListen(app)),
          })
      : null,
  });
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

function toggle(label: string, hint: string, checked: boolean, onchange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked, ariaLabel: label, onchange: () => onchange(input.checked) });
  return h('label', { class: 'toggle' }, h('span', {}, label, h('br'), h('span', { class: 'muted small' }, hint)), input);
}

/** Filter beim Start einer Sitzung (Briefing 4). */
function filters(app: App): HTMLElement {
  const active = app.settings.hideUncertain || app.settings.onlyExpressions || app.settings.typing || search !== '';
  const searchInput = h('input', {
    type: 'search',
    value: search,
    placeholder: 'Wort suchen (französisch oder deutsch)',
    autocapitalize: 'off',
    spellcheck: false,
  });
  searchInput.setAttribute('autocorrect', 'off');
  searchInput.addEventListener('change', () => {
    search = searchInput.value.trim();
    home(app);
  });
  const set = (patch: Partial<Settings>) => {
    saveSettings(app, patch);
    home(app);
  };
  return h(
    'details',
    { class: 'panel filters', open: active },
    h('summary', {}, 'Filter und Tippmodus', active && h('span', { class: 'dot' })),
    searchInput,
    toggle('Unsichere Bedeutungen ausblenden', 'Einträge mit „eigen?“', app.settings.hideUncertain, (v) => set({ hideUncertain: v })),
    toggle('Nur Wendungen', 'Expressions, nur Französisch → Deutsch', app.settings.onlyExpressions, (v) => set({ onlyExpressions: v })),
    toggle('Tippmodus', 'bei Deutsch → Französisch erst eintippen, dann umdrehen', app.settings.typing, (v) => set({ typing: v })),
  );
}

/** Deutsche Bedeutungen als Liste; die erste fett. */
function meaningList(de: string): HTMLElement[] {
  const lines = meaningLines(de);
  const meanings = lines.filter((l) => !l.example);
  const examples = lines.filter((l) => l.example);
  return [
    h(
      'ul',
      { class: 'meanings' },
      ...meanings.map((l, i) =>
        h('li', { class: i === 0 ? 'main' : '' }, l.num !== null && h('span', { class: 'num' }, String(l.num)), h('span', {}, ...withContext(l.text))),
      ),
    ),
    ...(examples.length > 0
      ? [
          h(
            'div',
            { class: 'examples' },
            ...examples.map((l) => {
              const [fr, ...de2] = l.text.split(/\s=\s/u);
              return h('div', { class: 'example' }, h('i', { lang: 'fr' }, fr ?? ''), ' = ', ...withContext(de2.join(' = ')));
            }),
          ),
        ]
      : []),
  ];
}

function frenchWord(fr: string, opts: { hideGender?: boolean } = {}): HTMLElement {
  return h('div', { class: 'front', lang: 'fr' }, ...frSegments(fr, opts).map((s) => (s.note ? h('span', { class: 'note' }, s.text) : s.text)));
}

/** Vorderseite: das abgefragte Wort. Bei Deutsch → Französisch die deutschen Bedeutungen. */
function front(entry: QueueEntry): HTMLElement {
  if (entry.direction === 'fr-de') return frenchWord(entry.item.fr);
  return h('div', { class: 'prompt-de', lang: 'de' }, ...meaningList(entry.item.de));
}

/** Rückseite: die Lösung, darunter Notiz. Beim Tippen zusätzlich die eigene Eingabe. */
function back(entry: QueueEntry, typed: { answer: string; match: boolean } | null, footer: Node | null = null): HTMLElement {
  const { item } = entry;
  const deFr = entry.direction === 'de-fr';
  return h(
    'div',
    { class: 'back', onclick: (ev: Event) => ev.stopPropagation() },
    h('div', { class: 'label' }, deFr ? 'Französisch' : 'Deutsch'),
    ...(deFr ? [frenchWord(item.fr)] : meaningList(item.de)),
    typed &&
      h(
        'div',
        { class: `typed ${typed.match ? 'match' : 'nomatch'}` },
        h('span', { class: 'muted small' }, 'Deine Antwort'),
        h('span', { lang: 'fr' }, typed.answer || '—'),
        h('span', { class: 'verdict' }, typed.match ? 'passt' : 'weicht ab'),
      ),
    h(
      'div',
      { class: 'back-foot' },
      item.notiz ? h('details', { class: 'notiz', open: item.expression }, h('summary', {}, 'Notiz'), h('p', {}, item.notiz)) : h('span', {}),
      footer,
    ),
  );
}

function quiz(app: App): void {
  const queue = queueFor(app);
  const session = new Session(queue, app.states, app.planner, app.settings.sessionSize, newId());
  let entry: QueueEntry | null = null;
  let shownAt = new Date();
  let revealedAt: Date | null = null;
  let busy = false;
  let cardEl: HTMLElement | null = null;
  /** Tippmodus: Eingabe und Vergleichsergebnis der aktuellen Karte. */
  let typed: { answer: string; match: boolean } | null = null;
  /** Meldeformular statt der Antwortknöpfe. */
  let reporting = false;
  const typing = (e: QueueEntry | null) => app.settings.typing && e?.direction === 'de-fr';

  const finish = () => {
    document.removeEventListener('keydown', onKey);
    const more = queueFor(app);
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
    const { state, event } = session.answer({ known, now: new Date(), shownAt, revealedAt, appVersion: __APP_VERSION__, ...(typed ? { typed } : {}) });
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
    typed = null;
    reporting = false;
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
    typed = null;
    reporting = false;
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
      revealedAt &&
        back(
          e,
          typed,
          app.reported.has(e.item.id)
            ? h('span', { class: 'tag' }, 'gemeldet')
            : h('button', { class: 'link-button', textContent: 'Melden', title: 'Eintrag an die Listenpflege melden (M)', onclick: () => ((reporting = true), render()) }),
        ),
    );
    swipe(cardEl);

    let actions: HTMLElement;
    let focusTarget: HTMLElement | null = null;
    if (revealedAt && reporting) {
      let reason: ReportReason = e.item.sicherheit === 'eigen?' ? 'bedeutung' : 'sonstiges';
      const chips = REPORT_REASONS.map((r) => {
        const b = h('button', { type: 'button', className: `chip${r.value === reason ? ' on' : ''}`, textContent: r.label });
        b.onclick = () => {
          reason = r.value;
          chips.forEach((c) => c.classList.toggle('on', c === b));
        };
        return b;
      });
      const note = h('textarea', { rows: 2, placeholder: 'Was stimmt nicht? (optional)' });
      const submit = (ev: Event) => {
        ev.preventDefault();
        const report: Report = {
          id: newId(),
          ts: new Date().toISOString(),
          itemId: e.item.id,
          fr: e.item.fr,
          de: e.item.de,
          richtung: e.item.richtung,
          line: e.item.line,
          sicherheit: e.item.sicherheit,
          reason,
          note: note.value.trim(),
        };
        persist(() => app.store.addReport(report));
        app.reported.add(e.item.id);
        reporting = false;
        render();
      };
      actions = h(
        'form',
        { class: 'actions report-form panel', onsubmit: submit },
        h('div', { class: 'chips' }, ...chips),
        note,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', type: 'submit', textContent: 'Melden' }),
          h('button', { type: 'button', textContent: 'Abbrechen', onclick: () => ((reporting = false), render()) }),
        ),
      );
      focusTarget = note;
    } else if (!revealedAt && typing(e)) {
      const input = h('input', {
        type: 'text',
        lang: 'fr',
        placeholder: 'Auf Französisch eintippen …',
        autocapitalize: 'off',
        spellcheck: false,
        enterKeyHint: 'done',
      });
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocomplete', 'off');
      const submit = () => {
        const value = input.value.trim();
        typed = { answer: value, match: matchesAnswer(value, e.item.fr) };
        flip();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') (ev.preventDefault(), submit());
      });
      actions = h('form', { class: 'actions typing', onsubmit: (ev: Event) => (ev.preventDefault(), submit()) }, input, h('button', { class: 'primary', type: 'submit', textContent: 'Prüfen' }));
      focusTarget = input;
    } else if (!revealedAt) {
      actions = h('div', { class: 'actions hint muted' }, 'Karte antippen zum Umdrehen');
    } else {
      const now = new Date();
      const p = app.planner.preview(session.stateOf(e), now);
      actions = h(
        'div',
        { class: 'actions answers' },
        h('button', { class: `unknown${typed && !typed.match ? ' suggested' : ''}`, onclick: () => answer(false) }, 'Wusste ich nicht', h('small', {}, label(now, p.unknown))),
        h('button', { class: `known${typed?.match ? ' suggested' : ''}`, onclick: () => answer(true) }, 'Wusste ich', h('small', {}, label(now, p.known))),
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
    focusTarget?.focus();
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (reporting) {
      if (ev.key === 'Escape') (reporting = false), render();
      return;
    }
    if (ev.key === 'm' && revealedAt && entry && !app.reported.has(entry.item.id) && !(ev.target instanceof HTMLInputElement)) {
      ev.preventDefault(); // sonst landet das „m“ im gleich fokussierten Notizfeld
      reporting = true;
      return render();
    }
    // Im Tippfeld nur Esc abfangen; Enter erledigt das Feld selbst.
    if (ev.target instanceof HTMLInputElement) {
      if (ev.key === 'Escape') finish();
      return;
    }
    // Nach dem Tippen übernimmt Enter den Vorschlag.
    if (ev.key === 'Enter' && revealedAt && typed) {
      ev.preventDefault();
      return answer(typed.match);
    }
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

const GAMES: Record<GameMode, { title: string; rule: string }> = {
  sprint: { title: '60 Sekunden', rule: 'So viele Wörter wie möglich. Richtig +1, falsch −1.' },
  sudden: { title: 'Sudden Death', rule: `${SUDDEN_SECONDS_PER_WORD} Sekunden pro Wort. Der erste Fehler beendet das Spiel.` },
};

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Spiel: französisches Wort, vier deutsche Antworten, gegen die Uhr. Ändert die Lernplanung nicht. */
function game(app: App, mode: GameMode): void {
  const { title, rule } = GAMES[mode];
  let best = 0;
  const bestEl = h('p', { class: 'small muted' }, '');
  void app.store.getBest(mode).then((b) => {
    best = b;
    bestEl.textContent = b > 0 ? `Bestwert: ${b}` : 'Noch kein Bestwert';
  });
  const intro = h('button', { class: 'primary', textContent: 'Los', onclick: () => play() });
  const onIntroKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') (ev.preventDefault(), play());
    if (ev.key === 'Escape') (document.removeEventListener('keydown', onIntroKey), home(app));
  };
  document.addEventListener('keydown', onIntroKey);
  show(
    h(
      'div',
      { class: 'end' },
      h('div', { class: 'panel game-intro' }, h('h2', {}, title), h('p', { class: 'muted' }, rule), bestEl),
      intro,
      h('button', { textContent: 'Zurück', onclick: () => (document.removeEventListener('keydown', onIntroKey), home(app)) }),
    ),
  );
  intro.focus();

  function play(): void {
    document.removeEventListener('keydown', onIntroKey);
    const sessionId = newId();
    const distractors = app.file.items.filter((i) => i.directions.includes('fr-de'));
    let targets = shuffled(gamePool(app.file.items, app.states));
    let round: Round | null = null;
    let roundStart = 0;
    let hits = 0;
    let misses = 0;
    let locked = false;
    let over = false;
    const missed: Round['target'][] = [];
    const t0 = performance.now();
    const limitMs = (mode === 'sprint' ? SPRINT_SECONDS : SUDDEN_SECONDS_PER_WORD) * 1000;

    const fill = h('div', { class: 'fill' });
    const clock = h('span', {}, '');
    const scoreEl = h('span', { class: 'score' }, '0');
    const cardHost = h('div', { class: 'deck' });
    const optionsHost = h('div', { class: 'options' });
    show(
      h(
        'div',
        { class: 'bar' },
        iconButton('close', 'Spiel beenden (Esc)', () => end()),
        h('div', { class: 'meter' }, h('div', { class: 'track' }, fill), h('div', { class: 'count' }, clock, h('span', {}, title))),
        scoreEl,
      ),
      cardHost,
      optionsHost,
    );

    const score = () => (mode === 'sprint' ? hits - misses : hits);

    const tick = () => {
      if (over) return;
      const now = performance.now();
      const left = mode === 'sprint' ? limitMs - (now - t0) : limitMs - (now - roundStart);
      fill.style.width = `${Math.max(0, (100 * left) / limitMs)}%`;
      clock.textContent = `${Math.max(0, Math.ceil(left / 1000))} s`;
      if (left <= 0) {
        if (mode === 'sprint') return end();
        if (!locked) choose(null);
      }
      requestAnimationFrame(tick);
    };

    const nextRound = () => {
      if (targets.length === 0) targets = shuffled(gamePool(app.file.items, app.states));
      round = buildRound(targets.pop()!, distractors);
      roundStart = performance.now();
      locked = false;
      cardHost.replaceChildren(h('div', { class: 'card game-card' }, h('div', { class: 'face' }, front({ cardId: '', item: round.target, direction: 'fr-de' }))));
      optionsHost.replaceChildren(
        ...round.options.map((o, i) => {
          const b = h('button', { class: 'option', onclick: () => choose(o.item.id) }, h('span', { class: 'key' }, String(i + 1)), o.text);
          b.dataset.item = o.item.id;
          return b;
        }),
      );
    };

    const choose = (itemId: string | null) => {
      if (!round || locked || over) return;
      locked = true;
      const r = round;
      const correct = itemId === r.target.id;
      if (correct) hits++;
      else (misses++, missed.push(r.target));
      scoreEl.textContent = String(score());
      for (const b of optionsHost.querySelectorAll<HTMLButtonElement>('.option')) {
        if (b.dataset.item === r.target.id) b.classList.add('right');
        else if (b.dataset.item === itemId) b.classList.add('wrong');
      }
      const now = new Date();
      const cid = `${r.target.id}/fr-de`;
      const event = gameEvent({
        ts: now.toISOString(),
        sessionId,
        game: mode,
        cardId: cid,
        itemId: r.target.id,
        correct,
        chosenItemId: itemId,
        optionItemIds: r.options.map((o) => o.item.id),
        latencyMs: Math.round(performance.now() - roundStart),
      });
      const pulled = correct ? null : pullForward(app.states.get(cid), now);
      if (pulled) {
        app.states.set(cid, pulled);
        persist(() => app.store.record(pulled, event));
      } else {
        persist(() => app.store.log(event));
      }
      if (!correct && mode === 'sudden') return void setTimeout(end, 700);
      setTimeout(nextRound, correct ? 140 : 650);
    };

    const end = () => {
      if (over) return;
      over = true;
      document.removeEventListener('keydown', onKey);
      const final = score();
      const record = final > best;
      if (record) persist(() => app.store.setBest(mode, final));
      const again = h('button', { class: 'primary', textContent: 'Nochmal', onclick: () => game(app, mode) });
      show(
        h(
          'div',
          { class: 'end' },
          h(
            'div',
            { class: 'panel' },
            h('b', {}, String(final)),
            h('p', { class: 'muted' }, mode === 'sprint' ? `${hits} richtig · ${misses} falsch` : `${hits} in Folge`),
            h('p', { class: 'small' }, record ? 'Neuer Bestwert' : `Bestwert: ${best}`),
          ),
          missed.length > 0 &&
            h(
              'div',
              { class: 'panel missed' },
              h('div', { class: 'label' }, 'Nicht gewusst'),
              ...missed.map((m) => h('div', { class: 'miss' }, h('span', { lang: 'fr' }, m.fr), h('span', { class: 'muted' }, meaningLines(m.de)[0]?.text ?? m.de))),
            ),
          again,
          h('button', { textContent: 'Zur Übersicht', onclick: () => home(app) }),
        ),
      );
      again.focus();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (/^[1-4]$/.test(ev.key)) {
        const id = round?.options[Number(ev.key) - 1]?.item.id;
        if (id) choose(id);
      } else if (ev.key === 'Escape') {
        end();
      }
    };
    document.addEventListener('keydown', onKey);
    nextRound();
    requestAnimationFrame(tick);
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  show(h('div', { class: 'error' }, `Fehler beim Start: ${String(err)}`));
});
