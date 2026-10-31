// Rückfragenkatalog der Chat-Sitzung (private/rueckfragen/, nie im Repo) in den geschützten Datenordner der App
// kopieren: public/data/rueckfragen/. Online liegt er wie die Wortliste hinter dem Passwort.
//   npm run rueckfragen

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { questionsFrom, type Catalog } from '../src/core/questions.ts';

const src = resolve(process.argv[2] ?? 'private/rueckfragen');
const out = resolve('public/data/rueckfragen');

if (!existsSync(join(src, 'katalog.json'))) {
  console.log(`Kein Rückfragenkatalog unter ${src} – übersprungen.`);
  process.exit(0);
}
const catalog = JSON.parse(readFileSync(join(src, 'katalog.json'), 'utf8')) as Catalog;
const questions = questionsFrom(catalog);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'bilder'), { recursive: true });
copyFileSync(join(src, 'katalog.json'), join(out, 'katalog.json'));
if (existsSync(join(src, 'antworten_bisher.json'))) copyFileSync(join(src, 'antworten_bisher.json'), join(out, 'antworten_bisher.json'));
let images = 0;
if (existsSync(join(src, 'bilder'))) {
  for (const f of readdirSync(join(src, 'bilder'))) {
    if (!/\.(jpe?g|png|webp)$/iu.test(f)) continue;
    copyFileSync(join(src, 'bilder', f), join(out, 'bilder', f));
    images++;
  }
}
const missing = questions.filter((q) => q.bild && !existsSync(join(src, q.bild))).map((q) => q.id);
console.log(`Rückfragen: ${questions.length} beantwortbare Fragen (Stand ${catalog.stand}), ${images} Bilder → ${out}`);
if (missing.length > 0) console.log(`Warnung: Bild fehlt bei ${missing.join(', ')}`);
