// Kapitel „Statistik“: Bestand, Abrufquote im Verlauf, Aktivität, Schwächen nach Kategorie,
// Kalibrierung, Rekorde und Spielform. Alles wird beim Öffnen aus dem Protokoll berechnet.

import type { CardState, GameMode, LogEvent } from '../core/state.ts';
import {
  activity,
  calibration,
  DIMENSIONS,
  effectiveReviews,
  gameRuns,
  inventory,
  median,
  MIN_N,
  records,
  retention,
  triageByFacet,
  weaknesses,
  type Window,
} from '../core/stats.ts';
import { dayKey } from '../core/stats.ts';
import type { Item } from '../core/types.ts';
import { h, show } from './dom.ts';

const SVG = 'http://www.w3.org/2000/svg';
function s(tag: string, attrs: { [k: string]: string | number } = {}, ...children: (Node | null | false)[]): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}
/** Diagramm in tatsächlicher Breite zeichnen, damit Beschriftungen auf iPhone und iPad gleich groß bleiben. */
function chartHost(draw: (width: number) => SVGElement): HTMLElement {
  const host = h('div', { class: 'chart-host' });
  let last = 0;
  new ResizeObserver(() => {
    const w = Math.round(host.clientWidth);
    if (w > 0 && w !== last) {
      last = w;
      host.replaceChildren(draw(w));
    }
  }).observe(host);
  return host;
}

/** Natives Tooltip für Diagrammelemente. */
const tip = (text: string) => s('title', {}, document.createTextNode(text));

const WINDOWS: { label: string; value: Window; long: string }[] = [
  { label: '7 T', value: 7, long: 'den 7 Tagen davor' },
  { label: '30 T', value: 30, long: 'den 30 Tagen davor' },
  { label: '90 T', value: 90, long: 'den 90 Tagen davor' },
  { label: '1 J', value: 365, long: 'dem Jahr davor' },
  { label: 'Alles', value: 0, long: '' },
];
let currentWindow: Window = 30;
let currentDim = 'class';

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export interface StatsInput {
  items: Item[];
  states: Map<string, CardState>;
  events: LogEvent[];
  desiredRetention: number;
  back: () => void;
  closeButton: (onclick: () => void) => HTMLElement;
}

function section(title: string, ...children: (Node | null | false)[]): HTMLElement {
  return h('section', { class: 'panel stat-section' }, h('h2', {}, title), ...(children.filter(Boolean) as Node[]));
}

function empty(text: string): HTMLElement {
  return h('p', { class: 'muted small empty' }, text);
}

// ---------------------------------------------------------------- Bestand

function inventoryView(items: Item[], states: Map<string, CardState>): HTMLElement {
  const inv = inventory(items, states);
  const parts = [
    { key: 'retired', label: 'gewusst', n: inv.retired, step: 5 },
    { key: 'mature', label: 'gefestigt', n: inv.mature, step: 4 },
    { key: 'young', label: 'jung', n: inv.young, step: 3 },
    { key: 'learning', label: 'lernend', n: inv.learning, step: 2 },
    { key: 'unsorted', label: 'unsortiert', n: inv.unsorted, step: 0 },
  ];
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  const bar = h('div', { class: 'stack' });
  for (const p of parts) {
    if (p.n === 0) continue;
    const seg = h('span', { class: `seg v${p.step}`, title: `${p.label}: ${p.n.toLocaleString('de-DE')}` });
    seg.style.flexGrow = String(p.n / total);
    bar.append(seg);
  }
  return section(
    'Bestand',
    bar,
    h(
      'ul',
      { class: 'legend' },
      ...parts.map((p) => h('li', {}, h('i', { class: `sw v${p.step}` }), h('span', {}, p.label), h('b', {}, p.n.toLocaleString('de-DE')))),
    ),
    h('p', { class: 'muted small' }, 'Richtung Französisch → Deutsch, ein Wort je Eintrag. Gefestigt = sitzt seit mindestens 21 Tagen stabil.'),
  );
}

// ---------------------------------------------------------------- Abrufquote

function retentionView(reviews: ReturnType<typeof effectiveReviews>, desired: number): HTMLElement {
  const win = WINDOWS.find((w) => w.value === currentWindow)!;
  const v = retention(reviews, new Date(), currentWindow);
  const delta = v.rate !== null && v.prevRate !== null && v.prevN >= 5 ? Math.round((v.rate - v.prevRate) * 100) : null;

  const pts = v.points;
  const draw = (W: number) => {
  const H = Math.round(Math.min(220, Math.max(150, W * 0.42)));
  const pad = { l: 30, r: 8, t: 10, b: 22 };
  const x = (i: number) => pad.l + (pts.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (pts.length - 1));
  const y = (r: number) => pad.t + (1 - r) * (H - pad.t - pad.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': 'Abrufquote im Zeitverlauf' });
  for (const g of [0, 0.5, 1]) {
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(g), y2: y(g), class: 'grid' }));
    svg.append(s('text', { x: pad.l - 6, y: y(g) + 4, class: 'axis', 'text-anchor': 'end' }, document.createTextNode(`${g * 100}`)));
  }
  svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(desired), y2: y(desired), class: 'target' }, tip(`Ziel: ${Math.round(desired * 100)} %`)));
  // Linie nur durch Abschnitte mit Daten; Lücken bleiben offen.
  let d = '';
  pts.forEach((p, i) => {
    if (p.rate === null) return;
    const prev = pts[i - 1];
    d += `${prev && prev.rate !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`;
  });
  svg.append(s('path', { d, class: 'line' }));
  pts.forEach((p, i) => {
    if (p.rate === null) return;
    const label = `${p.start.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}: ${pct(p.rate)} (${p.n})`;
    svg.append(s('circle', { cx: x(i), cy: y(p.rate), r: p.n >= 5 ? 4 : 3, class: p.n >= 5 ? 'dot' : 'dot weak' }, tip(label)));
    svg.append(s('rect', { x: x(i) - 8, y: pad.t, width: 16, height: H - pad.t - pad.b, class: 'hit' }, tip(label)));
  });
  const ticks = Math.min(pts.length, W < 500 ? 4 : 6);
  for (let t = 0; t < ticks; t++) {
    const i = Math.round((t * (pts.length - 1)) / Math.max(1, ticks - 1));
    const p = pts[i];
    if (!p) continue;
    const fmt: Intl.DateTimeFormatOptions = v.bucket === 'Monat' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' };
    const anchor = t === 0 ? 'start' : t === ticks - 1 ? 'end' : 'middle';
    svg.append(s('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': anchor }, document.createTextNode(p.start.toLocaleDateString('de-DE', fmt))));
  }
  return svg;
  };

  return section(
    'Abrufquote',
    h(
      'div',
      { class: 'hero' },
      h('b', {}, pct(v.rate)),
      h(
        'span',
        { class: 'muted small' },
        v.n > 0 ? `gewusst bei ${v.n} Wiederholungen` : 'noch keine Wiederholungen',
        delta !== null && win.long ? h('br') : null,
        delta !== null && win.long ? h('span', { class: delta >= 0 ? 'up' : 'down' }, `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} Punkte gegenüber ${win.long}`) : null,
      ),
    ),
    v.n > 0 ? chartHost(draw) : empty('Sobald Wörter wiederkommen, erscheint hier der Verlauf.'),
    h('p', { class: 'muted small' }, `Je ${v.bucket}. Gestrichelt: Ziel ${Math.round(desired * 100)} %. Kleine Punkte: weniger als 5 Abfragen.`),
    h(
      'p',
      { class: 'small' },
      'Sortierphase: ',
      h('b', {}, pct(v.triageRate)),
      ` beim ersten Sehen gewusst (${v.triageN.toLocaleString('de-DE')} neue Karten in diesem Zeitraum)`,
    ),
  );
}

// ---------------------------------------------------------------- Aktivität

function activityView(events: LogEvent[]): HTMLElement {
  const act = activity(events);
  const weeks = 26;
  const gap = 3;
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks - 1) * 7 - ((today.getDay() + 6) % 7));
  const max = Math.max(1, ...act.values());
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor((3 * n) / max + 0.0001)));
  const draw = (W: number) => {
  const cell = Math.max(6, Math.min(18, (W - 22) / weeks - gap));
  const H = 7 * (cell + gap) + 18;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart heat', role: 'img', 'aria-label': 'Aktive Tage der letzten 26 Wochen' });
  ['Mo', 'Mi', 'Fr'].forEach((d, i) => svg.append(s('text', { x: 0, y: 18 + (i * 2 + 1) * (cell + gap) - 4, class: 'axis' }, document.createTextNode(d))));
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day > today) continue;
      const key = dayKey(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12));
      const n = act.get(key) ?? 0;
      if (d === 0 && day.getMonth() !== lastMonth) {
        lastMonth = day.getMonth();
        svg.append(s('text', { x: 22 + w * (cell + gap), y: 10, class: 'axis' }, document.createTextNode(day.toLocaleDateString('de-DE', { month: 'short' }))));
      }
      svg.append(
        s(
          'rect',
          { x: 22 + w * (cell + gap), y: 18 + d * (cell + gap), width: cell, height: cell, rx: 3, class: `day l${level(n)}` },
          tip(`${day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}: ${n} Antworten`),
        ),
      );
    }
  }
  return svg;
  };
  const last30 = [...act.entries()].filter(([k]) => Date.parse(`${k}T12:00:00`) > today.getTime() - 30 * 86_400_000).length;
  return section(
    'Aktivität',
    chartHost(draw),
    h(
      'div',
      { class: 'heat-legend muted small' },
      h('span', {}, `${last30} aktive Tage in den letzten 30`),
      h('span', { class: 'scale' }, 'weniger', ...[0, 1, 2, 3, 4].map((l) => h('i', { class: `sw day l${l}` })), 'mehr'),
    ),
  );
}

// ---------------------------------------------------------------- Schwächen

function weaknessView(reviews: ReturnType<typeof effectiveReviews>, items: Item[], rerender: () => void): HTMLElement {
  const byId = new Map(items.map((i) => [i.id, i]));
  const dim = DIMENSIONS.find((d) => d.key === currentDim) ?? DIMENSIONS[0]!;
  const facets = weaknesses(reviews, byId, dim);
  const triage = triageByFacet(reviews, byId, dim);
  const tabs = h(
    'div',
    { class: 'segmented small-seg' },
    ...DIMENSIONS.map((d) =>
      h('button', {
        textContent: d.label,
        className: d.key === dim.key ? 'on' : '',
        onclick: () => {
          currentDim = d.key;
          rerender();
        },
      }),
    ),
  );
  const RANGE = 0.3;
  const rows = facets.map((f) => {
    const w = Math.min(1, Math.abs(f.diff) / RANGE) * 50;
    const bar = h('span', { class: `dev ${f.diff < 0 ? 'neg' : 'pos'}` });
    bar.style.width = `${w}%`;
    bar.style[f.diff < 0 ? 'right' : 'left'] = '50%';
    return h(
      'div',
      { class: `facet${f.reliable ? '' : ' unreliable'}`, title: `${f.value}: gewusst ${pct(f.observed)}, erwartet ${pct(f.predicted)}, 95 %: ${pct(f.low)}–${pct(f.high)}, n = ${f.n}` },
      h('span', { class: 'name' }, f.value),
      h('span', { class: 'track-dev' }, h('i', { class: 'zero' }), bar),
      h('span', { class: 'val' }, `${f.diff >= 0 ? '+' : '−'}${Math.abs(Math.round(f.diff * 100))}`),
      h('span', { class: 'n muted' }, f.reliable ? `n ${f.n}` : `n ${f.n}*`),
    );
  });
  const triageRows = triage.map((t) => {
    const bar = h('span', { class: 'fillbar' });
    bar.style.width = `${Math.round(t.rate * 100)}%`;
    return h(
      'div',
      { class: `facet${t.n >= MIN_N ? '' : ' unreliable'}` },
      h('span', { class: 'name' }, t.value),
      h('span', { class: 'track-fill' }, bar),
      h('span', { class: 'val' }, pct(t.rate)),
      h('span', { class: 'n muted' }, t.n >= MIN_N ? `n ${t.n}` : `n ${t.n}*`),
    );
  });
  return section(
    'Schwächen nach Kategorie',
    tabs,
    h('h3', {}, 'Wiederholungen: gewusst minus erwartet (Prozentpunkte)'),
    facets.length > 0 ? h('div', { class: 'facets' }, ...rows) : empty('Noch keine Wiederholungen mit Vorhersage.'),
    h('h3', {}, 'Sortierphase: beim ersten Sehen gewusst'),
    triage.length > 0 ? h('div', { class: 'facets' }, ...triageRows) : empty('Noch keine neuen Karten sortiert.'),
    h(
      'p',
      { class: 'muted small' },
      `Links (rosé): schwächer, als FSRS nach Schwierigkeit und Abstand erwartet; rechts (violett): stärker. * = weniger als ${MIN_N} Abfragen, nur Tendenz. Wortart grob aus den Klammerzusätzen der Liste.`,
    ),
  );
}

// ---------------------------------------------------------------- Kalibrierung

function calibrationView(reviews: ReturnType<typeof effectiveReviews>): HTMLElement {
  const bins = calibration(reviews).filter((b) => b.n > 0);
  const S = 240;
  const pad = 30;
  const p = (v: number) => pad + v * (S - pad - 8);
  const q = (v: number) => S - pad - v * (S - pad - 8);
  const svg = s('svg', { viewBox: `0 0 ${S} ${S}`, class: 'chart calib', role: 'img', 'aria-label': 'Vorhersage gegen tatsächliche Quote' });
  for (const g of [0, 0.5, 1]) {
    svg.append(s('line', { x1: p(0), x2: p(1), y1: q(g), y2: q(g), class: 'grid' }));
    svg.append(s('text', { x: pad - 6, y: q(g) + 4, class: 'axis', 'text-anchor': 'end' }, document.createTextNode(`${g * 100}`)));
    svg.append(s('text', { x: p(g), y: S - 10, class: 'axis', 'text-anchor': 'middle' }, document.createTextNode(`${g * 100}`)));
  }
  svg.append(s('line', { x1: p(0), y1: q(0), x2: p(1), y2: q(1), class: 'target' }));
  for (const b of bins) {
    svg.append(
      s('circle', { cx: p(b.predicted!), cy: q(b.observed!), r: 5, class: b.n >= MIN_N ? 'dot' : 'dot hollow' }, tip(`erwartet ${pct(b.predicted)}, gewusst ${pct(b.observed)}, n = ${b.n}`)),
    );
  }
  return section(
    'Kalibrierung',
    bins.length > 0 ? svg : empty('Erscheint, sobald Wiederholungen mit Vorhersage vorliegen.'),
    h(
      'p',
      { class: 'muted small' },
      'Waagerecht: von FSRS erwartete Wahrscheinlichkeit, senkrecht: tatsächlich gewusst. Auf der Diagonale stimmt die Planung. Darüber: mehr gewusst als erwartet, die Abstände könnten länger sein; darunter: weniger, die Abstände sind zu lang. Größere Abweichungen gleicht später die Optimierung der FSRS-Parameter aus. Hohl: weniger als 30 Abfragen.',
    ),
  );
}

// ---------------------------------------------------------------- Rekorde und Spiele

function recordsView(events: LogEvent[]): HTMLElement {
  const rec = records(events);
  const runs = gameRuns(events);
  const form = (mode: GameMode, title: string) => {
    const list = runs.filter((r) => r.mode === mode).slice(-20);
    if (list.length === 0) return null;
    const max = Math.max(1, ...list.map((r) => r.score));
    const min = Math.min(0, ...list.map((r) => r.score));
    const med = median(list.slice(-10).map((r) => r.score)) ?? 0;
    const draw = (W: number) => {
    const H = 70;
    const bw = W / 20;
    const y = (v: number) => 6 + ((max - v) / (max - min || 1)) * (H - 12);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart spark', role: 'img', 'aria-label': `${title}: letzte Läufe` });
    list.forEach((r, i) => {
      const top = Math.min(y(r.score), y(0));
      svg.append(s('rect', { x: i * bw + 2, y: top, width: bw - 4, height: Math.max(2, Math.abs(y(r.score) - y(0))), rx: 2, class: 'bar' }, tip(`${fmtDate(r.ts)}: ${r.score}`)));
    });
    svg.append(s('line', { x1: 0, x2: W, y1: y(med), y2: y(med), class: 'target' }, tip(`Median der letzten 10: ${med}`)));
    return svg;
    };
    return h('div', { class: 'form' }, h('div', { class: 'form-head' }, h('b', {}, title), h('span', { class: 'muted small' }, `Median der letzten 10: ${med}`)), chartHost(draw));
  };
  return section(
    'Rekorde',
    h(
      'div',
      { class: 'records' },
      ...rec.map((r) => h('div', { class: 'record' }, h('b', {}, r.value.toLocaleString('de-DE')), h('span', {}, r.label), r.date ? h('span', { class: 'muted small' }, fmtDate(r.date)) : null)),
    ),
    form('sprint', '60 Sekunden'),
    form('sudden', 'Sudden Death'),
    h('p', { class: 'muted small' }, 'Aktive Tage am Stück: ein einzelner freier Tag unterbricht nicht.'),
  );
}

// ---------------------------------------------------------------- Seite

export function statsPage(input: StatsInput): void {
  const reviews = effectiveReviews(input.events);
  const render = () => {
    const windowTabs = h(
      'div',
      { class: 'segmented win-seg' },
      ...WINDOWS.map((w) =>
        h('button', {
          textContent: w.label,
          className: w.value === currentWindow ? 'on' : '',
          onclick: () => {
            currentWindow = w.value;
            render();
          },
        }),
      ),
    );
    const y = window.scrollY;
    show(
      h('div', { class: 'bar' }, input.closeButton(input.back), h('h1', { class: 'page-title' }, 'Statistik'), h('span', {})),
      windowTabs,
      inventoryView(input.items, input.states),
      retentionView(reviews, input.desiredRetention),
      activityView(input.events),
      weaknessView(reviews, input.items, render),
      calibrationView(reviews),
      recordsView(input.events),
    );
    window.scrollTo(0, y);
  };
  render();
}
