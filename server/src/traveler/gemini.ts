/**
 * LLM traveler — Gemini implementation of the TravelerEngine seam (F2).
 *
 * Uses the REST API directly (global fetch, no SDK dependency). Model is
 * pinned via TRAVELER_MODEL and recorded in every trace along with params
 * and request/response (roadmap Simulation #1 trace requirements).
 *
 * Resilience: any failure (HTTP error, timeout, unparseable output, guard
 * tripped twice) falls back to the fixture reply for that turn — the
 * session always survives, mirroring the F8 fallback philosophy.
 */

import { ScenarioCard, Turn } from '../contracts';
import { TravelerEngine, ReplyTurn } from './types';
import { buildSystemPrompt, OPENING_CUE, PROMPT_VERSION } from './prompt';
import { hasGenericOpening, llmStats, trippedGuard, parseReplies, sleep, TravelerUnavailableError } from './llm-shared';
import { trace } from '../tracing/tracer';

const MODEL = process.env.TRAVELER_MODEL || 'gemini-3.5-flash';
const TIMEOUT_MS = 10_000;
// maxOutputTokens must leave headroom for thinking-model overhead even with
// thinkingBudget 0; thinking is off because a 1-2 sentence in-character reply
// doesn't need it and the latency NFR (p50 ≤ 2s) does.
const PARAMS = { temperature: 0.8, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } };

function toContents(turns: Turn[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  if (turns.length === 0) {
    return [{ role: 'user', parts: [{ text: OPENING_CUE }] }];
  }
  return turns.map(t => ({
    role: t.role === 'trainee' ? 'user' : 'model',
    parts: [{ text: t.role === 'companion' ? `[companion] ${t.text}` : t.text }],
  }));
}

/** Pull the API-suggested retry delay (google.rpc.RetryInfo) out of a 429 body, capped at 30s. */
function retryDelayMs(errorJson: any): number {
  const detail = errorJson?.error?.details?.find((d: any) => String(d['@type']).includes('RetryInfo'));
  const seconds = parseFloat(String(detail?.retryDelay ?? '').replace('s', ''));
  return Math.min(Number.isFinite(seconds) ? seconds * 1000 : 15_000, 30_000);
}

/** Thinking models may emit multiple parts; keep only non-thought text. */
function extractText(json: any): string | undefined {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  const text = parts.filter((p: any) => typeof p?.text === 'string' && !p.thought).map((p: any) => p.text).join('');
  return text.length > 0 ? text : undefined;
}

async function callGemini(apiKey: string, systemPrompt: string, turns: Turn[], sessionId: string, attempt: number): Promise<ReplyTurn[] | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: toContents(turns),
    generationConfig: { ...PARAMS, responseMimeType: 'application/json' },
  };

  // One rate-limit retry using the API's suggested delay — free-tier RPM is
  // the normal case for this project, not an exception.
  for (let fetchTry = 1; fetchTry <= 2; fetchTry++) {
    llmStats.calls++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json: any = await res.json().catch(() => null);
      const rawText = extractText(json);

      trace('traveler.llm_call', { session_id: sessionId, attempt, fetch_try: fetchTry, http_status: res.status, ok: res.ok }, {
        prompt_version: PROMPT_VERSION,
        model: MODEL,
        params: PARAMS,
        // Log the conversation shape, not the full system prompt every turn (it's card-derived and versioned)
        request: { turn_count: turns.length, last_turn: turns[turns.length - 1]?.text ?? '(opening)' },
        response: rawText ?? json,
      });

      if (res.status === 429 && fetchTry === 1) {
        await sleep(retryDelayMs(json));
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
      trace('traveler.llm_error', { session_id: sessionId, attempt, fetch_try: fetchTry, error: String(err) }, {
        prompt_version: PROMPT_VERSION,
        model: MODEL,
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

export function createGeminiTraveler(apiKey: string): TravelerEngine {
  return {
    name: MODEL,
    async reply(card: ScenarioCard, turns: Turn[], sessionId: string): Promise<ReplyTurn[]> {
      const systemPrompt = buildSystemPrompt(card);

      const first = await callGemini(apiKey, systemPrompt, turns, sessionId, 1);
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
        // One corrective retry: re-ask with an appended in-character reminder
        const nudged: Turn[] = [
          ...turns,
          { turn_id: 'nudge', role: 'trainee', text: turns.length === 0
            ? '(Give a varied, natural first-contact line. Do not use a generic concern question such as "Is everything okay?" or "Is something wrong?")'
            : '(Stay fully in character; answer only as the traveler would, in their own words.)' },
        ];
        const second = await callGemini(apiKey, systemPrompt, nudged, sessionId, 2);
        if (second && !trippedGuard(second) && !(turns.length === 0 && hasGenericOpening(second))) return second;
      }

      // No silent fixture fallback (see openai-compat.ts): surface the failure
      // so the trainee can retry against the real model.
      trace('traveler.unavailable', { session_id: sessionId });
      throw new TravelerUnavailableError('Gemini reply failed after retries');
    },
  };
}
