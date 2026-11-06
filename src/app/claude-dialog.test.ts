import { describe, expect, it } from 'vitest';
import type { Question } from '../core/questions.ts';
import { fallbackScript } from '../core/voice-questions.ts';
import { createDialog } from './claude-dialog.ts';

const q: Question = { id: 'a1', group: 'singles', q: 'Welche Fassung?', opts: ['chat = Katze', 'chat = Kater'] };

function fakeApi(replies: unknown[], status = 200) {
  const bodies: { messages: { role: string; content: { type: string; text?: string; tool_use_id?: string }[] }[]; model: string; fallbacks: unknown }[] = [];
  const headers: Headers[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    headers.push(new Headers(init.headers));
    const reply = replies.shift();
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, bodies, headers };
}

const message = (content: unknown[], stop_reason = 'end_turn') => ({ id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason, usage: { input_tokens: 1, output_tokens: 1 } });

describe('Gespräch mit Claude', () => {
  it('schickt beim ersten Mal den Kontext, danach nur das Gesagte, und gibt die Antworten unverändert zurück', async () => {
    const api = fakeApi([message([{ type: 'text', text: 'Das ist {le chat}.' }]), message([{ type: 'text', text: 'Gern.' }])]);
    const d = createDialog('schluessel', q, fallbackScript(q), api.impl);
    expect((await d.send('Was heißt das?')).speech).toBe('Das ist {le chat}.');
    await d.send('Danke');
    const [first, second] = api.bodies;
    expect(first!.model).toBe('claude-opus-5-5');
    expect(first!.fallbacks).toBe('default');
    expect(first!.messages[0]!.content[0]!.text).toContain('Welche Fassung?');
    expect(api.headers[0]!.get('authorization')).toBe('Bearer schluessel');
    expect(second!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second!.messages[2]!.content).toEqual([{ type: 'text', text: 'Jan sagt: Danke' }]);
  });

  it('liefert den Vorschlag und meldet die Ablehnung beim nächsten Mal', async () => {
    const proposal = { picks: [2], removed: [], verdict: '', text: '', del: false };
    const api = fakeApi([message([{ type: 'tool_use', id: 'w1', name: 'antwort_vorschlagen', input: proposal }], 'tool_use'), message([{ type: 'text', text: 'Gut.' }])]);
    const d = createDialog('schluessel', q, fallbackScript(q), api.impl);
    expect((await d.send('Nimm zwei')).proposal).toEqual(proposal);
    d.reject();
    await d.send('Doch lieber nicht');
    const result = api.bodies[1]!.messages[2]!.content[0]!;
    expect(result.type).toBe('tool_result');
    expect(result.tool_use_id).toBe('w1');
  });

  it('falscher Schlüssel und Ablehnung durch das Modell werden gemeldet', async () => {
    const bad = fakeApi([{ type: 'error', error: { type: 'authentication_error', message: 'x' } }], 401);
    expect((await createDialog('falsch', q, fallbackScript(q), bad.impl).send('Hallo')).failure).toBe('key');
    const refused = fakeApi([message([], 'refusal')]);
    expect((await createDialog('s', q, fallbackScript(q), refused.impl).send('Hallo')).failure).toBe('refusal');
  });

  it('Netzfehler: Äußerung bleibt nicht im Verlauf', async () => {
    let calls = 0;
    const flaky = (async (_u: string, init: RequestInit) => {
      if (calls++ < 2) throw new TypeError('Failed to fetch');
      const body = JSON.parse(init.body as string);
      expect(body.messages).toHaveLength(1);
      return new Response(JSON.stringify(message([{ type: 'text', text: 'Ja.' }])), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const d = createDialog('s', q, fallbackScript(q), flaky);
    expect((await d.send('Hallo')).failure).toBe('network');
    expect((await d.send('Hallo')).speech).toBe('Ja.');
  });
});
