// Import: CSV (Quelle der Wahrheit, wird nie beschrieben) → public/data/cards.json
//
//   npm run import                    # Standardpfad oder $TMM_CSV
//   npm run import -- --csv pfad.csv
//   npm run import:check              # nur Diff-Protokoll, nichts schreiben

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { SCHEMA_VERSION, type CardsFile } from '../src/core/types.ts';
import { diffImport, formatDiff } from '../src/import/diff.ts';
import { parseVocabulary } from '../src/import/importer.ts';

const DEFAULT_CSV = join(homedir(), 'Documents/Vokabeln & Definitionen/Vokabeln/Französisch-Vokabeln/woerterbuch_neu.csv');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const csvPath = resolve(arg('--csv') ?? process.env.TMM_CSV ?? DEFAULT_CSV);
const outPath = resolve(arg('--out') ?? 'public/data/cards.json');
const dryRun = process.argv.includes('--dry-run');

const raw = readFileSync(csvPath);
const { items, collisions, warnings } = parseVocabulary(raw.toString('utf8'));
const prev: CardsFile | null = existsSync(outPath) ? (JSON.parse(readFileSync(outPath, 'utf8')) as CardsFile) : null;
const now = new Date();
const today = now.toISOString().slice(0, 10);
const diff = diffImport(prev, items, today);

const cards = items.reduce((n, i) => n + i.directions.length, 0);
console.log(`Quelle: ${csvPath}`);
console.log(`${items.length} Einträge → ${cards} Karten (${items.filter((i) => i.expression).length} Expressions nur fr→de)`);
if (collisions.length > 0) {
  console.log(`Schlüsselkollisionen (Suffix nach Dateireihenfolge): ${collisions.map((c) => `${c.key} → ${c.ids.join(', ')}`).join('; ')}`);
}
for (const w of warnings) console.log(`Warnung: ${w}`);
console.log('');
console.log(formatDiff(diff, prev === null));

if (dryRun) {
  console.log('\n(Probelauf, nichts geschrieben)');
} else {
  const file: CardsFile = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    source: { file: basename(csvPath), sha1: createHash('sha1').update(raw).digest('hex'), rows: items.length },
    items,
    orphans: diff.orphans,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 1) + '\n');
  renameSync(tmp, outPath);
  console.log(`\nGeschrieben: ${outPath}`);
}
