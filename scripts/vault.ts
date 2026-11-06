// Tresor bauen: Wortliste, Rückfragenkatalog und Bilder verschlüsselt nach public/vault.json (kommt ins Repo).
//   npm run daten                 # CSV importieren, Rückfragen übernehmen, verschlüsseln, committen, pushen
//   npm run daten -- --kein-push  # nur verschlüsseln
//   npm run daten -- --neues-passwort
// Das Passwort wird verdeckt abgefragt (oder aus TMM_PASSWORD gelesen, nur für Tests).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { decryptVault, deriveKey, encryptVault, fromB64, keyForVault, PBKDF2_ITERATIONS, WrongPasswordError, type Vault, type VaultPayload } from '../src/core/vault.ts';
import type { CardsFile } from '../src/core/types.ts';

const args = process.argv.slice(2);
const OUT = resolve(args.find((a) => a.startsWith('--out='))?.slice(6) ?? 'public/vault.json');
const DATA = resolve('public/data');
const push = !args.includes('--kein-push') && !process.env.TMM_PASSWORD;
const newPassword = args.includes('--neues-passwort');

/** Passwort verdeckt von der Tastatur lesen (Sternchen statt Zeichen). */
function askHidden(prompt: string): Promise<string> {
  return new Promise((done, fail) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return fail(new Error('Kein Terminal für die Passworteingabe (oder TMM_PASSWORD setzen).'));
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return done(value);
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f') {
          if (value.length > 0) (value = value.slice(0, -1)), process.stdout.write('\b \b');
        } else {
          value += c;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

function readPayload(): VaultPayload {
  const cardsPath = join(DATA, 'cards.json');
  if (!existsSync(cardsPath)) throw new Error('public/data/cards.json fehlt – zuerst npm run import.');
  const payload: VaultPayload = { cards: JSON.parse(readFileSync(cardsPath, 'utf8')) as CardsFile };
  const rq = join(DATA, 'rueckfragen');
  if (existsSync(join(rq, 'katalog.json'))) {
    const bilder: Record<string, string> = {};
    const dir = join(rq, 'bilder');
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(f).toLowerCase()];
        if (mime) bilder[f] = `data:${mime};base64,${readFileSync(join(dir, f)).toString('base64')}`;
      }
    }
    payload.rueckfragen = {
      katalog: JSON.parse(readFileSync(join(rq, 'katalog.json'), 'utf8')),
      antworten: existsSync(join(rq, 'antworten_bisher.json')) ? JSON.parse(readFileSync(join(rq, 'antworten_bisher.json'), 'utf8')) : {},
      bilder,
      ...(existsSync(join(rq, 'sprechtexte.json')) ? { sprechtexte: JSON.parse(readFileSync(join(rq, 'sprechtexte.json'), 'utf8')) } : {}),
    };
  }
  const audio = resolve('private/audio/manifest.json');
  if (existsSync(audio)) payload.audio = JSON.parse(readFileSync(audio, 'utf8'));
  return payload;
}

async function main() {
  const payload = readPayload();
  const existing = existsSync(OUT) && !newPassword ? (JSON.parse(readFileSync(OUT, 'utf8')) as Vault) : null;
  const env = process.env.TMM_PASSWORD;
  let password: string;
  if (env) password = env;
  else if (existing) password = await askHidden('Passwort der App: ');
  else {
    password = await askHidden('Neues Passwort für die App (mindestens 10 Zeichen): ');
    if (password.length < 10) throw new Error('Zu kurz – bitte mindestens 10 Zeichen.');
    if ((await askHidden('Noch einmal zur Bestätigung: ')) !== password) throw new Error('Die beiden Eingaben stimmen nicht überein.');
  }

  // Bestehenden Salt behalten, damit die Geräte ihren gespeicherten Schlüssel weiter nutzen können.
  let salt: Uint8Array<ArrayBuffer>;
  let key: CryptoKey;
  if (existing) {
    key = await keyForVault(existing, password);
    try {
      await decryptVault(existing, key);
    } catch (err) {
      if (err instanceof WrongPasswordError) throw new Error('Das Passwort passt nicht zum bisherigen Tresor. (Neues Passwort? npm run daten -- --neues-passwort)');
      throw err;
    }
    salt = fromB64(existing.kdf.salt);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  }
  const vault = await encryptVault(payload, key, salt, existing?.kdf.iterations ?? PBKDF2_ITERATIONS);
  writeFileSync(OUT, JSON.stringify(vault) + '\n');
  const kb = Math.round(readFileSync(OUT).length / 1024);
  const q = payload.rueckfragen ? `, ${Object.keys(payload.rueckfragen.bilder).length} Bilder, Rückfragenkatalog` : '';
  console.log(`Tresor geschrieben: ${OUT} (${kb} KB; ${payload.cards.items.length} Einträge${q})`);
  if (newPassword) console.log('Neues Passwort: Auf jedem Gerät einmal neu anmelden.');

  if (!push) return;
  const packs = resolve('public/audio');
  const paths = existsSync(packs) ? [OUT, packs] : [OUT];
  execFileSync('git', ['add', ...paths], { stdio: 'inherit' });
  const changed = execFileSync('git', ['diff', '--cached', '--name-only']).toString().trim();
  if (!changed) return console.log('Keine Änderung zum Veröffentlichen.');
  execFileSync('git', ['commit', '-m', `Wortliste aktualisiert (${payload.cards.items.length} Einträge)`, '--', ...paths], { stdio: 'inherit' });
  execFileSync('git', ['push'], { stdio: 'inherit' });
  console.log('Gepusht. GitHub veröffentlicht die App in etwa einer Minute.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
