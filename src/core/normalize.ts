// Normalisierung für Schlüssel (stabile IDs) und für den Antwortvergleich im Tippmodus.

/** Schlüsselform laut Briefing: NFC, Kleinschreibung, Whitespace vereinheitlicht. Klammern bleiben. */
export function normalizeKey(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Lemma ohne Klammerzusätze, z. B. „essuie-glace (m)“ → „essuie-glace“. Für die Anzeige. */
export function splitAnnotations(s: string): { head: string; annotations: string[] } {
  const annotations: string[] = [];
  const head = s
    .replace(/\(([^()]*)\)/gu, (_, inner: string) => {
      annotations.push(inner.trim());
      return ' ';
    })
    .replace(/\s+/gu, ' ')
    .trim();
  return { head, annotations };
}

const ARTICLE = /^(?:(?:le|la|les|un|une|des|du)\s+|l'\s*)/u;
const PLACEHOLDER = /(^|\s)(?:qn|qc|qch|qqn|qqch|qqc|jdn|jdm|jds|etw\.?)(?=\s|$)/gu;

/**
 * Vergleichsform einer Antwort: Akzente, Groß-/Kleinschreibung, Klammerzusätze, Artikel,
 * Platzhalter (qn, qc …), typografische Apostrophe und Satzzeichen am Rand spielen keine Rolle.
 */
export function normalizeAnswer(s: string): string {
  let t = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’ʼ`´]/gu, "'")
    .replace(/œ/gu, 'oe')
    .replace(/æ/gu, 'ae');
  t = t.replace(/\([^()]*\)/gu, ' ').replace(/[()]/gu, ' ');
  t = t.replace(/\s+/gu, ' ').trim();
  t = t.replace(ARTICLE, '');
  t = t.replace(PLACEHOLDER, '$1');
  t = t.replace(/^[\s.,;:!?…«»"-]+|[\s.,;:!?…«»"]+$/gu, '');
  return t.replace(/\s+/gu, ' ').trim();
}

/**
 * Zerlegt eine Antwortspalte in einzeln akzeptierte Varianten:
 * Trennung an `;`, an Nummerierung `1.`/`2.`, an ` / ` und an Kommas.
 * Ein Komma vor einer Femininendung („effronté, -e“) trennt nicht.
 */
export function answerVariants(field: string): string[] {
  const parts = field
    .split(/;|(?:^|\s)\d+\.\s|\s\/\s/u)
    .flatMap((p) => p.split(/,(?!\s*-)/u))
    .map((p) => p.replace(/,\s*-\p{L}+/gu, ''));
  const out: string[] = [];
  for (const p of parts) {
    const n = normalizeAnswer(p);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Vorschlag für den Tippmodus: passt die Eingabe zu einer der Varianten? Die Entscheidung trifft der Nutzer. */
export function matchesAnswer(input: string, field: string): boolean {
  const n = normalizeAnswer(input);
  return n !== '' && answerVariants(field).includes(n);
}
