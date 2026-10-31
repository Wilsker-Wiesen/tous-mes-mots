// Cloudflare Worker: liefert die gebaute App (dist/) aus, aber nur nach Passwort.
// Die Wortliste ist urheberrechtlich heikel und liegt deshalb nie öffentlich; das Passwort setzt Jan selbst:
//   npx wrangler secret put APP_PASSWORD

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  APP_PASSWORD?: string;
}

const COOKIE = 'tmm_session';
const COOKIE_MAX_AGE = 400 * 24 * 3600; // höchstens 400 Tage nehmen Browser an
/** Ohne Anmeldung erreichbar: Anmeldeseite und alles, was iOS für „Zum Home-Bildschirm“ braucht. */
const PUBLIC = new Set(['/login', '/robots.txt', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.ico']);
const FAIL_DELAY_MS = 800;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

/** Sitzungsmarke aus dem Passwort: Ein neues Passwort meldet alle Geräte ab. */
export async function sessionToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode('tous-mes-mots/session/v1')));
}

/** Vergleich in konstanter Zeit, damit die Antwortdauer nichts verrät. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Nur relative Ziele innerhalb der App zulassen (kein offener Redirect). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/';
}

const SECURITY_HEADERS: [string, string][] = [
  ['X-Robots-Tag', 'noindex, nofollow'],
  ['Referrer-Policy', 'no-referrer'],
  ['X-Content-Type-Options', 'nosniff'],
];

function withHeaders(res: Response, extra: [string, string][] = []): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of [...SECURITY_HEADERS, ...extra]) out.headers.set(k, v);
  return out;
}

function loginPage(next: string, error: string | null, status = 200): Response {
  const esc = (s: string) => s.replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const tiles = ['TOUS', 'MES', 'MOTS']
    .map((w) => `<span class="w">${[...w].map((c, i) => `<span class="t${i === 0 ? ' f' : ''}">${c}</span>`).join('')}</span>`)
    .join('');
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f4f1fa"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Mes mots">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="icon" href="/icon.svg"><link rel="manifest" href="/manifest.webmanifest">
<title>Tous mes mots – Anmelden</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f4f1fa;color:#221a33;font:17px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;padding:24px}
form{width:min(420px,100%);display:flex;flex-direction:column;gap:14px}
h1{display:flex;gap:.45em;margin:0 0 8px;font:700 clamp(17px,5.75vw,32px)/1 Arial,Helvetica,sans-serif}.w{display:flex;gap:.14em}
.t{display:grid;place-items:center;width:1.3em;height:1.25em;border-radius:.22em;color:#4b2a8f;background:#fff;border:1px solid #e4ddf1;box-shadow:0 .1em 0 #c7b2ef}
.t.f{color:#fff;background:#7444cc;border-color:#7444cc;box-shadow:0 .1em 0 #4b2a8f}
input{font:inherit;padding:14px;border-radius:14px;border:1px solid #c7b2ef;background:#fff}
button{font:inherit;font-weight:650;padding:16px;border-radius:14px;color:#4b2a8f;background:linear-gradient(#faf7ff,#e8ddfb);border:1px solid #c7b2ef;box-shadow:0 4px 12px rgb(60 30 110/.12)}
.err{color:#b83a6e;margin:0}.muted{color:#6e6485;font-size:14px;margin:0}
</style></head><body>
<form method="post" action="/login">
<h1 aria-label="Tous mes mots">${tiles}</h1>
<p class="muted">Persönlicher Vokabeltrainer. Bitte Passwort eingeben.</p>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<input type="password" name="password" autocomplete="current-password" placeholder="Passwort" required autofocus aria-label="Passwort">
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Anmelden</button>
</form></body></html>`;
  return withHeaders(new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
}

export async function handle(request: Request, env: Env, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/robots.txt') {
    return withHeaders(new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } }));
  }
  if (!env.APP_PASSWORD) {
    return withHeaders(new Response('Passwort noch nicht gesetzt: npx wrangler secret put APP_PASSWORD', { status: 503 }));
  }
  const token = await sessionToken(env.APP_PASSWORD);

  if (url.pathname === '/login') {
    if (request.method === 'POST') {
      const form = await request.formData();
      const next = safeNext(String(form.get('next') ?? '/'));
      const given = await sessionToken(String(form.get('password') ?? ''));
      if (!same(given, token)) {
        await sleep(FAIL_DELAY_MS);
        return loginPage(next, 'Das Passwort stimmt nicht.', 401);
      }
      return withHeaders(
        new Response(null, {
          status: 303,
          headers: {
            Location: next,
            'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
            'Cache-Control': 'no-store',
          },
        }),
      );
    }
    return loginPage(safeNext(url.searchParams.get('next')), null);
  }

  const cookie = cookieValue(request, COOKIE);
  if (!PUBLIC.has(url.pathname) && !(cookie && same(cookie, token))) {
    const wantsPage = request.method === 'GET' && (request.headers.get('Accept') ?? '').includes('text/html');
    if (wantsPage) {
      return withHeaders(new Response(null, { status: 302, headers: { Location: `/login?next=${encodeURIComponent(url.pathname + url.search)}`, 'Cache-Control': 'no-store' } }));
    }
    return withHeaders(new Response('Anmeldung erforderlich', { status: 401, headers: { 'Cache-Control': 'no-store' } }));
  }

  const res = await env.ASSETS.fetch(request);
  // Die Wortliste nie in fremden Zwischenspeichern ablegen.
  return withHeaders(res, url.pathname.startsWith('/data/') ? [['Cache-Control', 'private, no-cache']] : []);
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};
