// Gespräch mit Claude zu einer Rückfrage. Läuft direkt aus dem Browser mit Jans eigenem Schlüssel, der nur auf
// diesem Gerät liegt. Das SDK wird erst beim ersten Gespräch geladen.

import type Anthropic from '@anthropic-ai/sdk';
import type { Question } from '../core/questions.ts';
import { CLAUDE_SYSTEM, questionContext, type ClaudeProposal, type SpokenScript } from '../core/voice-questions.ts';

export const CLAUDE_KEY_META = 'claude:schluessel';
const MODEL = 'claude-opus-5-5';

const PROPOSE_TOOL: Anthropic.Beta.BetaTool = {
  name: 'antwort_vorschlagen',
  description: 'Schlägt Jans Entscheidung zur aktuellen Frage zum Eintragen vor. Er bestätigt danach selbst.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['picks', 'removed', 'verdict', 'text', 'del'],
    properties: {
      picks: { type: 'array', items: { type: 'integer' }, description: 'Nummern der gewählten Optionen (ab 1).' },
      removed: { type: 'array', items: { type: 'integer' }, description: 'Nummern der Bedeutungen, die raus sollen (ab 1).' },
      verdict: { type: 'string', enum: ['', 'stimmt', 'falsch', 'lassen', 'behalten', 'passt', 'aufnehmen'] },
      text: { type: 'string', description: 'Freitext, sonst leer.' },
      del: { type: 'boolean', description: 'Eintrag streichen.' },
    },
  },
};

export type DialogFailure = 'key' | 'network' | 'refusal' | 'other';

export interface DialogReply {
  /** Vorzulesender Text (Französisches in geschweiften Klammern). */
  speech: string;
  proposal: ClaudeProposal | null;
  failure?: DialogFailure;
}

export interface Dialog {
  send(said: string): Promise<DialogReply>;
  /** Vorschlag abgelehnt: Claude erfährt es mit der nächsten Äußerung. */
  reject(): void;
}

export function createDialog(apiKey: string, q: Question, script: SpokenScript, fetchImpl?: typeof fetch): Dialog {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  let client: Anthropic | null = null;
  let SDK: typeof Anthropic | null = null;
  /** Offener Werkzeugaufruf: Die API verlangt das Ergebnis als Nächstes. */
  let pendingTool: { id: string; result: string } | null = null;
  let started = false;

  return {
    reject() {
      if (pendingTool) pendingTool.result = 'Jan hat den Vorschlag abgelehnt. Nichts wurde eingetragen.';
    },

    async send(said) {
      if (!client || !SDK) {
        SDK = (await import('@anthropic-ai/sdk')).default;
        client = new SDK({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 30_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
      }
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (pendingTool) content.push({ type: 'tool_result', tool_use_id: pendingTool.id, content: pendingTool.result });
      if (!started) content.push({ type: 'text', text: `Die offene Frage:\n${questionContext(q, script)}` });
      content.push({ type: 'text', text: `Jan sagt: ${said}` });
      const sent = messages.length;
      messages.push({ role: 'user', content });

      try {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: CLAUDE_SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools: [PROPOSE_TOOL],
          messages,
        });
        pendingTool = null;
        started = true;
        if (response.stop_reason === 'refusal') {
          messages.length = sent;
          return { speech: '', proposal: null, failure: 'refusal' };
        }
        // Vollständig übernehmen: Denkblöcke müssen unverändert zurück.
        messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
        const speech = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ').trim();
        const tool = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        if (tool) pendingTool = { id: tool.id, result: 'Jan hat bestätigt.' };
        return { speech, proposal: tool ? (tool.input as ClaudeProposal) : null };
      } catch (err) {
        messages.length = sent;
        if (err instanceof SDK.AuthenticationError || err instanceof SDK.PermissionDeniedError) return { speech: '', proposal: null, failure: 'key' };
        if (err instanceof SDK.APIConnectionError) return { speech: '', proposal: null, failure: 'network' };
        console.error(err);
        return { speech: '', proposal: null, failure: 'other' };
      }
    },
  };
}
