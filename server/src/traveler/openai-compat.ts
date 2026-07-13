/**
 * LLM traveler over any OpenAI-compatible chat-completions API.
 *
 * Primary target: Groq's free tier (fast Llama-70B-class models, dev-friendly
 * rate limits). Also works with Cerebras or any other /chat/completions host —
 * point TRAVELER_API_BASE at it.
 *
 * Same behavior contract as the Gemini implementation: roleplay-v1 prompt,
 * never-reveal guard with one corrective retry, one 429 retry, and fixture
 * fallback on any failure so the session always survives.
 */

import { ScenarioCard, Turn } from '../contracts';
import { TravelerEngine, ReplyTurn } from './types';
import { fixtureTraveler } from './fixture';
import { buildSystemPrompt, OPENING_CUE, PROMPT_VERSION } from './prompt';
import { llmStats, trippedGuard, parseReplies, sleep } from './llm-shared';
import { trace } from '../tracing/tracer';

const TIMEOUT_MS = 10_000;
const PARAMS = { temperature: 0.8, max_tokens: 300 };

export interface OpenAiCompatConfig {
  apiBase: string;   // e.g. https://api.groq.com/openai/v1
  apiKey: string;
  model: string;     // pinned; recorded in traces
  label: string;     // provider name for logs/traces, e.g. 'groq'
}

function toMessages(systemPrompt: string, turns: Turn[]): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }];
  if (turns.length === 0) {
    messages.push({ role: 'user', content: OPENING_CUE });
    return messages;
  }
  for (const t of turns) {
    messages.push({
      role: t.role === 'trainee' ? 'user' : 'assistant',
      content: t.role === 'companion' ? `[companion] ${t.text}` : t.text,
    });
  }
  return messages;
}

async function callChatCompletions(cfg: OpenAiCompatConfig, systemPrompt: string, turns: Turn[], sessionId: string, attempt: number): Promise<ReplyTurn[] | null> {
  // json_object mode pins the model to a single JSON object root — the prompt
  // asks for {"turns":[...]} and parseReplies unwraps it. Llama-class models
  // drift into prose without this.
  const body = {
    model: cfg.model,
    messages: toMessages(systemPrompt, turns),
    response_format: { type: 'json_object' as const },
    ...PARAMS,
  };

  // One rate-limit retry honoring Retry-After when present.
  for (let fetchTry = 1; fetchTry <= 2; fetchTry++) {
    llmStats.calls++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${cfg.apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json: any = await res.json().catch(() => null);
      const rawText: string | undefined = json?.choices?.[0]?.message?.content ?? undefined;

      trace('traveler.llm_call', { session_id: sessionId, attempt, fetch_try: fetchTry, http_status: res.status, ok: res.ok, provider: cfg.label }, {
        prompt_version: PROMPT_VERSION,
        model: cfg.model,
        params: PARAMS,
        request: { turn_count: turns.length, last_turn: turns[turns.length - 1]?.text ?? '(opening)' },
        response: rawText ?? json,
      });

      if (res.status === 429 && fetchTry === 1) {
        const retryAfter = parseFloat(res.headers.get('retry-after') ?? '');
        await sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 10_000, 30_000));
        continue;
      }
      if (!res.ok || !rawText) {
        llmStats.http_failures++;
        return null;
      }
      const replies = parseReplies(rawText);
      if (!replies) llmStats.parse_failures++;
      return replies;
    } catch (err) {
      trace('traveler.llm_error', { session_id: sessionId, attempt, fetch_try: fetchTry, error: String(err), provider: cfg.label }, {
        prompt_version: PROMPT_VERSION,
        model: cfg.model,
        params: PARAMS,
      });
      llmStats.http_failures++;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function createOpenAiCompatTraveler(cfg: OpenAiCompatConfig): TravelerEngine {
  return {
    name: `${cfg.label}:${cfg.model}`,
    async reply(card: ScenarioCard, turns: Turn[], sessionId: string): Promise<ReplyTurn[]> {
      const systemPrompt = buildSystemPrompt(card);

      const first = await callChatCompletions(cfg, systemPrompt, turns, sessionId, 1);
      if (first && !trippedGuard(first)) return first;

      if (first && trippedGuard(first)) {
        llmStats.guard_trips++;
        trace('traveler.guard_tripped', { session_id: sessionId, replies: first });
        const nudged: Turn[] = [
          ...turns,
          { turn_id: 'nudge', role: 'trainee', text: '(Stay fully in character; answer only as the traveler would, in their own words.)' },
        ];
        const second = await callChatCompletions(cfg, systemPrompt, nudged, sessionId, 2);
        if (second && !trippedGuard(second)) return second;
      }

      llmStats.fallbacks++;
      trace('traveler.fallback_to_fixture', { session_id: sessionId });
      return fixtureTraveler.reply(card, turns, sessionId);
    },
  };
}
