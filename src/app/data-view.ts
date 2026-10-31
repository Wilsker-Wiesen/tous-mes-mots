// Seite „Daten“: Sicherung speichern und einlesen, Meldungen an die CSV-Pflege, Protokoll als CSV.

import {
  buildBackup,
  eventsCsv,
  parseBackup,
  planMerge,
  REPORT_REASONS,
  reportsFile,
  type MergePlan,
  type Report,
} from '../core/backup.ts';
import { mergeAnswers, type Answer } from '../core/questions.ts';
import type { CardState, Settings } from '../core/state.ts';
import type { CardsFile } from '../core/types.ts';
import type { Store } from '../storage/db.ts';
import { h, show } from './dom.ts';
import { ANSWERS_KEY } from './questions-view.ts';

export const LAST_BACKUP_KEY = 'lastBackupAt';

export interface DataInput {
  file: CardsFile;
  store: Store;
  settings: Settings;
  states: Map<string, CardState>;
  appVersion: string;
  back: () => void;
  /** Nach einem Import alles neu laden. */
  reload: () => void;
  closeButton: (onclick: () => void) => HTMLElement;
}

const today = () => new Date().toISOString().slice(0, 10);
const count = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

/**
 * Datei speichern: auf iPhone/iPad über das Teilen-Menü (Dateien, AirDrop, iCloud Drive),
 * sonst als normaler Download.
 */
export async function saveFile(name: string, type: string, content: string): Promise<boolean> {
  const file = new File([content], name, { type });
  if (navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function section(title: string, ...children: (Node | null | false)[]): HTMLElement {
  return h('section', { class: 'panel stat-section' }, h('h2', {}, title), ...(children.filter(Boolean) as Node[]));
}

const fmt = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie';

export async function dataPage(input: DataInput): Promise<void> {
  const { store } = input;
  const [reports, lastBackup, persisted, estimate] = await Promise.all([
    store.allReports(),
    store.getMeta<string>(LAST_BACKUP_KEY),
    navigator.storage?.persisted?.() ?? Promise.resolve(false),
    navigator.storage?.estimate?.() ?? Promise.resolve(undefined),
  ]);
  const status = h('p', { class: 'small status', role: 'status' });
  const say = (text: string, ok = true) => {
    status.textContent = text;
    status.className = `small status ${ok ? 'ok' : 'bad'}`;
  };

  // ------------------------------------------------ Sicherung
  const exportBackup = async () => {
    const [cards, events, bests, allReports, questionAnswers] = await Promise.all([
      store.allStates(),
      store.allEvents(),
      store.allBests(),
      store.allReports(),
      store.getMeta<Answer[]>(ANSWERS_KEY),
    ]);
    const backup = buildBackup({ appVersion: input.appVersion, settings: input.settings, bests, cards, events, reports: allReports, questionAnswers: questionAnswers ?? [] });
    if (await saveFile(`tous-mes-mots-sicherung-${today()}.json`, 'application/json', JSON.stringify(backup))) {
      await store.setMeta(LAST_BACKUP_KEY, backup.exportedAt);
      await navigator.storage?.persist?.();
      void dataPage(input);
    }
  };

  const preview = h('div', { class: 'import-preview' });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    let plan: MergePlan;
    try {
      const backup = parseBackup(await f.text());
      const [cards, eventIds, localReports, bests, localAnswers] = await Promise.all([
        store.allStates(),
        store.eventIds(),
        store.allReports(),
        store.allBests(),
        store.getMeta<Answer[]>(ANSWERS_KEY),
      ]);
      const answerMap = new Map((localAnswers ?? []).map((a) => [a.id, a]));
      plan = planMerge({ cards, eventIds, reportIds: new Set(localReports.map((r) => r.id)), bests, questionAnswers: answerMap }, backup);
      preview.replaceChildren(
        h('p', {}, h('b', {}, f.name), ` vom ${fmt(backup.exportedAt)}`),
        h(
          'ul',
          { class: 'plain' },
          h('li', {}, `${count(plan.cards.length, 'Karte', 'Karten')} mit neuerem Stand übernehmen`),
          h('li', {}, `${count(plan.events.length, 'fehlenden Eintrag', 'fehlende Einträge')} im Protokoll ergänzen`),
          plan.reports.length > 0 && h('li', {}, `${count(plan.reports.length, 'Meldung', 'Meldungen')} ergänzen`),
          plan.questionAnswers.length > 0 && h('li', {}, `${count(plan.questionAnswers.length, 'Rückfragen-Antwort', 'Rückfragen-Antworten')} übernehmen`),
          plan.keptLocal > 0 && h('li', { class: 'muted' }, `${count(plan.keptLocal, 'Karte ist', 'Karten sind')} hier neuer und bleibt, wie sie ist`),
        ),
        plan.cards.length + plan.events.length + plan.reports.length + plan.questionAnswers.length + Object.keys(plan.bests).length === 0
          ? h('p', { class: 'muted small' }, 'Nichts Neues: Diese Sicherung ist schon vollständig enthalten.')
          : h(
              'div',
              { class: 'row' },
              h('button', {
                class: 'primary',
                textContent: 'Übernehmen',
                onclick: async () => {
                  await store.importMerged(plan);
                  if (plan.questionAnswers.length > 0) {
                    const mine = new Map(((await store.getMeta<Answer[]>(ANSWERS_KEY)) ?? []).map((a) => [a.id, a]));
                    await store.setMeta(ANSWERS_KEY, [...mergeAnswers(mine, plan.questionAnswers).values()]);
                  }
                  say('Sicherung eingelesen.');
                  input.reload();
                },
              }),
              h('button', { textContent: 'Abbrechen', onclick: () => preview.replaceChildren() }),
            ),
      );
    } catch (err) {
      preview.replaceChildren();
      say(err instanceof Error ? err.message : String(err), false);
    }
  });

  // ------------------------------------------------ Meldungen
  const exportReports = async () => {
    if (await saveFile(`meldungen-${today()}.json`, 'application/json', JSON.stringify(reportsFile(reports), null, 2))) {
      await store.setMeta('lastReportsExportAt', new Date().toISOString());
      say(`${reports.length} Meldungen exportiert. Datei an die Chat-Sitzung geben; danach hier „Liste leeren“.`);
    }
  };
  const reportRow = (r: Report) =>
    h(
      'li',
      { class: 'report' },
      h(
        'div',
        {},
        h('b', { lang: 'fr' }, r.fr),
        h('span', { class: 'muted small' }, ` ${r.richtung} · ${REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}`),
        r.note && h('div', { class: 'small' }, r.note),
      ),
      h('button', {
        class: 'icon small-icon',
        textContent: '×',
        ariaLabel: `Meldung zu ${r.fr} löschen`,
        onclick: async () => {
          await store.deleteReports([r.id]);
          void dataPage(input);
        },
      }),
    );

  // ------------------------------------------------ Auswertung
  const exportCsv = async () => {
    const events = await store.allEvents();
    const items = new Map(input.file.items.map((i) => [i.id, i]));
    await saveFile(`tous-mes-mots-protokoll-${today()}.csv`, 'text/csv', eventsCsv(events, items));
  };

  const mb = (n: number | undefined) => (n === undefined ? '?' : `${(n / 1_048_576).toFixed(1).replace('.', ',')} MB`);

  show(
    h('div', { class: 'bar' }, input.closeButton(input.back), h('h1', { class: 'page-title' }, 'Daten'), h('span', {})),
    status,
    section(
      'Sicherung',
      h('p', { class: 'small' }, 'Der Lernstand liegt nur auf diesem Gerät. Eine Sicherung enthält Kartenstände, das vollständige Protokoll, Bestwerte und Meldungen.'),
      h('p', { class: 'small' }, 'Letzte Sicherung: ', h('b', {}, fmt(lastBackup))),
      h('div', { class: 'row' }, h('button', { class: 'primary', textContent: 'Sicherung speichern', onclick: exportBackup }), h('button', { textContent: 'Sicherung einlesen …', onclick: () => fileInput.click() })),
      fileInput,
      preview,
      h(
        'p',
        { class: 'muted small' },
        'Einlesen führt zusammen statt zu überschreiben: Pro Karte gilt der neuere Stand, das Protokoll wird nur ergänzt. So lassen sich auch Sicherungen von iPhone und iPad nacheinander einlesen.',
      ),
    ),
    section(
      `Meldungen (${reports.length})`,
      h('p', { class: 'small' }, 'Gemeldete Einträge gehen als Datei an die Chat-Sitzung, die die Vokabelliste pflegt. Die App selbst ändert die Liste nie.'),
      reports.length > 0 ? h('ul', { class: 'plain reports' }, ...reports.sort((a, b) => b.ts.localeCompare(a.ts)).map(reportRow)) : h('p', { class: 'muted small' }, 'Keine offenen Meldungen. Melden geht auf der Rückseite jeder Karte.'),
      reports.length > 0 &&
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', textContent: 'Meldungen exportieren', onclick: exportReports }),
          h('button', {
            textContent: 'Liste leeren',
            onclick: async () => {
              if (!confirm(`${reports.length} Meldungen löschen? Vorher exportieren, sonst gehen sie verloren.`)) return;
              await store.deleteReports(reports.map((r) => r.id));
              void dataPage(input);
            },
          }),
        ),
    ),
    section(
      'Auswertung',
      h('p', { class: 'small' }, 'Das vollständige Protokoll als CSV (Semikolon, UTF-8) für Numbers, Excel, R oder Python.'),
      h('div', { class: 'row' }, h('button', { textContent: 'Protokoll als CSV', onclick: exportCsv })),
    ),
    section(
      'Speicher',
      h(
        'p',
        { class: 'small' },
        `Belegt: ${mb(estimate?.usage)} · Dauerhaft geschützt: `,
        h('b', {}, persisted ? 'ja' : 'nein'),
      ),
      !persisted &&
        h('button', {
          textContent: 'Dauerhaften Speicher anfordern',
          onclick: async () => {
            const ok = (await navigator.storage?.persist?.()) ?? false;
            say(ok ? 'Der Browser hält die Daten jetzt dauerhaft.' : 'Der Browser hat abgelehnt. Regelmäßig sichern; auf dem iPhone hilft „Zum Home-Bildschirm“.', ok);
            void dataPage(input);
          },
        }),
      h('p', { class: 'muted small' }, `${input.states.size.toLocaleString('de-DE')} Karten mit Lernstand · Wortliste vom ${new Date(input.file.generatedAt).toLocaleDateString('de-DE')}`),
    ),
  );
}
