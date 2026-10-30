// Aufbereitung der CSV-Texte für die Anzeige (ohne DOM).

export interface Segment {
  text: string;
  /** Klammerzusatz wie (m), (adj.), (fam.): kleiner dargestellt. */
  note: boolean;
}

/** Zerlegt „effronté, -e (adj.)“ in Text und Klammerzusätze; mit hideGender entfallen (m)/(f) u. Ä. */
export function frSegments(fr: string, opts: { hideGender?: boolean } = {}): Segment[] {
  const out: Segment[] = [];
  for (const part of fr.split(/(\([^()]*\))/u)) {
    if (!part) continue;
    const note = part.startsWith('(') && part.endsWith(')');
    if (note && opts.hideGender && /^\((?:m|f|m\/f|f\/m|m pl\.?|f pl\.?|m\.|f\.|pl\.?)\)$/u.test(part)) continue;
    out.push({ text: part, note });
  }
  return out;
}

export interface MeaningLine {
  /** Text ohne vorangestellte Nummer. */
  text: string;
  /** Nummer aus „1. …“, falls vorhanden. */
  num: number | null;
  /** Wendung oder Beispiel der Form „x = y“. */
  example: boolean;
}

/** Bedeutungen untereinander: Umbruch an `;` und vor `1.`, `2.` … */
export function meaningLines(de: string): MeaningLine[] {
  return de
    .split(/;\s*|\s+(?=\d+\.\s)/u)
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map((raw) => {
      const m = /^(\d+)\.\s*(.*)$/u.exec(raw);
      const text = m ? m[2]! : raw;
      return { text, num: m ? Number(m[1]) : null, example: /\s=\s/u.test(text) };
    });
}