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
import { buildSystemPrompt, OPENING_CUE, PROMPT_VERSION } from './prompt';
import { hasGenericOpening, llmStats, trippedGuard, parseReplies, sleep, TravelerUnavailableError } from './llm-shared';
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

  // Rate limits are the normal case on free tiers: retry up to 3 times with
  // escalating waits (Retry-After honored) before giving up. Latency beats a
  // canned reply — the traveler must always be the real model.
  const MAX_TRIES = 4;
  for (let fetchTry = 1; fetchTry <= MAX_TRIES; fetchTry++) {
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

      if (!res.ok) {
        llmStats.http_failures++;
        if (fetchTry < MAX_TRIES) {
          const retryAfter = parseFloat(res.headers.get('retry-after') ?? '');
          const wait = res.status === 429
            ? Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 6_000 * fetchTry, 20_000)
            : 2_000 * fetchTry;
          await sleep(wait);
          continue;
        }
        throw new TravelerUnavailableError(`HTTP ${res.status} after ${MAX_TRIES} attempts`);
      }
      if (!rawText) {
        llmStats.http_failures++;
        if (fetchTry < MAX_TRIES) continue;
        throw new TravelerUnavailableError('empty completion');
      }
      const replies = parseReplies(rawText);
      if (!replies) {
        llmStats.parse_failures++;
        if (fetchTry < MAX_TRIES) continue;
        throw new TravelerUnavailableError('unparseable completion');
      }
      return replies;
    } catch (err) {
      if (err instanceof TravelerUnavailableError) throw err;
      trace('traveler.llm_error', { session_id: sessionId, attempt, fetch_try: fetchTry, error: String(err), provider: cfg.label }, {
        prompt_version: PROMPT_VERSION,
        model: cfg.model,
        params: PARAMS,
      });
      llmStats.http_failures++;
      if (fetchTry >= MAX_TRIES) throw new TravelerUnavailableError(`network/timeout after ${MAX_TRIES} attempts`);
      await sleep(2_000 * fetchTry);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new TravelerUnavailableError('retries exhausted');
}

export function createOpenAiCompatTraveler(cfg: OpenAiCompatConfig): TravelerEngine {
  return {
    name: `${cfg.label}:${cfg.model}`,
    async reply(card: ScenarioCard, turns: Turn[], sessionId: string): Promise<ReplyTurn[]> {
      const systemPrompt = buildSystemPrompt(card);

      const first = await callChatCompletions(cfg, systemPrompt, turns, sessionId, 1);
      const firstGuardTripped = first ? trippedGuard(first) : false;
      const firstGenericOpening = first && turns.length === 0 ? hasGenericOpening(first) : false;
      if (first && !firstGuardTripped && !firstGenericOpening) return first;

      if (first && (firstGuardTripped || firstGenericOpening)) {
        if (firstGuardTripped) {
          llmStats.guard_trips++;
          trace('traveler.guard_tripped', { session_id: sessionId, replies: first });
        } else {
          trace('traveler.generic_opening_retried', { session_id: sessionId, replies: first });
        }
        const nudged: Turn[] = [
          ...turns,
          { turn_id: 'nudge', role: 'trainee', text: turns.length === 0
            ? '(Give a varied, natural first-contact line. Do not use a generic concern question such as "Is everything okay?" or "Is something wrong?")'
            : '(Stay fully in character; answer only as the traveler would, in their own words.)' },
        ];
        const second = await callChatCompletions(cfg, systemPrompt, nudged, sessionId, 2);
        if (second && !trippedGuard(second) && !(turns.length === 0 && hasGenericOpening(second))) return second;
      }

      // No silent fixture fallback: the fixture is the engine you get by
      // running keyless (F7), never a mid-session substitute for the model.
      trace('traveler.unavailable', { session_id: sessionId });
      throw new TravelerUnavailableError('reply failed character checks after corrective retry');
    },
  };
}
