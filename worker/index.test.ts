import { describe, expect, it } from 'vitest';
import { handle, sessionToken, type Env } from './index.ts';

const ORIGIN = 'https://tous-mes-mots.example.workers.dev';
const served: string[] = [];
const env: Env = {
  APP_PASSWORD: 'geheim-und-lang',
  ASSETS: {
    async fetch(req: Request) {
      served.push(new URL(req.url).pathname);
      return new Response('inhalt', { headers: { 'Content-Type': 'application/json' } });
    },
  },
};
const noSleep = async () => {};
const get = (path: string, headers: Record<string, string> = {}) => new Request(ORIGIN + path, { headers });
const login = (password: string, next = '/') =>
  new Request(`${ORIGIN}/login`, { method: 'POST', body: new URLSearchParams({ password, next }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

describe('Passwortschutz', () => {
  it('schützt die Wortliste ohne Anmeldung', async () => {
    const res = await handle(get('/data/cards.json'), env, noSleep);
    expect(res.status).toBe(401);
    expect(served).not.toContain('/data/cards.json');
  });

  it('leitet Seitenaufrufe zur Anmeldung um und merkt sich das Ziel', async () => {
    const res = await handle(get('/?x=1', { Accept: 'text/html' }), env, noSleep);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/login?next=%2F%3Fx%3D1');
  });

  it('falsches Passwort: 401 mit Hinweis, kein Cookie', async () => {
    const res = await handle(login('falsch'), env, noSleep);
    expect(res.status).toBe(401);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(await res.text()).toContain('Das Passwort stimmt nicht.');
  });

  it('richtiges Passwort: sicheres Cookie und Weiterleitung, danach Zugriff', async () => {
    const res = await handle(login('geheim-und-lang', '/statistik'), env, noSleep);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/statistik');
    const cookie = res.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    const value = cookie.split(';')[0]!;
    const ok = await handle(get('/data/cards.json', { Cookie: `andere=1; ${value}` }), env, noSleep);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(ok.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('Seitenaufrufe und Update-Prüfung verlängern die Anmeldung, Datenabrufe nicht', async () => {
    const token = await sessionToken('geheim-und-lang');
    const page = await handle(get('/', { Cookie: `tmm_session=${token}`, Accept: 'text/html' }), env, noSleep);
    expect(page.headers.get('Set-Cookie')).toMatch(/Max-Age=34560000; HttpOnly; Secure/);
    const sw = await handle(get('/sw.js', { Cookie: `tmm_session=${token}` }), env, noSleep);
    expect(sw.headers.get('Set-Cookie')).toMatch(/Max-Age=34560000/);
    const data = await handle(get('/data/cards.json', { Cookie: `tmm_session=${token}` }), env, noSleep);
    expect(data.headers.get('Set-Cookie')).toBeNull();
  });

  it('gefälschtes Cookie hilft nicht', async () => {
    const fake = await sessionToken('anderes-passwort');
    expect((await handle(get('/data/cards.json', { Cookie: `tmm_session=${fake}` }), env, noSleep)).status).toBe(401);
  });

  it('kein offener Redirect nach der Anmeldung', async () => {
    for (const next of ['//boese.example', 'https://boese.example', '/login']) {
      const res = await handle(login('geheim-und-lang', next), env, noSleep);
      expect(res.headers.get('Location')).toBe('/');
    }
  });

  it('Symbole und Anmeldeseite sind ohne Anmeldung erreichbar (für „Zum Home-Bildschirm“)', async () => {
    expect((await handle(get('/apple-touch-icon.png'), env, noSleep)).status).toBe(200);
    expect((await handle(get('/login'), env, noSleep)).status).toBe(200);
    expect(await (await handle(get('/robots.txt'), env, noSleep)).text()).toContain('Disallow: /');
  });

  it('ohne gesetztes Passwort bleibt alles zu', async () => {
    const res = await handle(get('/data/cards.json'), { ...env, APP_PASSWORD: undefined }, noSleep);
    expect(res.status).toBe(503);
  });
});
