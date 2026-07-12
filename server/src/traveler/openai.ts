/**
 * OpenAI traveler — GPT implementation of the TravelerEngine seam.
 *
 * Uses the Chat Completions REST API directly (no SDK). Model is pinned via
 * OPENAI_MODEL and defaults to gpt-4o-mini (fast + cheap for dev).
 *
 * Resilience: any failure (HTTP error, timeout, guard trip x2) falls back to
 * the fixture traveler for that turn — the session always survives.
 */

import { ScenarioCard, Turn } from '../contracts';
import { TravelerEngine, ReplyTurn } from './types';
import { fixtureTraveler } from './fixture';
import { buildSystemPrompt, OPENING_CUE, PROMPT_VERSION } from './prompt';
import { trace } from '../tracing/tracer';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 15_000;
const PARAMS = { temperature: 0.8, max_tokens: 300 };

/**
 * Never-reveal guard: if the model breaks character and mentions the simulation
 * or its own nature, retry once then fall back to fixture.
 */
const REVEAL_PATTERNS = [
  /\b(simulation|scenario|role.?play|training exercise)\b/i,
  /\bas an ai\b/i,
  /\b(language model|assistant|my instructions|i('m| am) (an ai|playing))\b/i,
  /\bground truth\b/i,
  /\btrafficking\b/i,
];

function trippedGuard(replies: ReplyTurn[]): boolean {
  return replies.some(r => REVEAL_PATTERNS.some(p => p.test(r.text)));
}

/** Map session turns to OpenAI message format. */
function toMessages(turns: Turn[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (turns.length === 0) {
    return [{ role: 'user', content: OPENING_CUE }];
  }
  return turns.map(t => ({
    role: t.role === 'trainee' ? 'user' : 'assistant',
    content: t.role === 'companion' ? `[companion] ${t.text}` : t.text,
  }));
}

/** Parse the JSON reply from the model into typed ReplyTurns. */
function parseReplies(raw: string): ReplyTurn[] | null {
  const cleaned = raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const replies: ReplyTurn[] = [];
    for (const item of arr) {
      if (typeof item?.text !== 'string' || item.text.trim().length === 0) return null;
      const role: ReplyTurn['role'] = item.speaker === 'companion' ? 'companion' : 'traveler';
      replies.push({ role, text: item.text.trim() });
    }
    if (!replies.some(r => r.role === 'traveler')) return null;
    return replies.slice(0, 2);
  } catch {
    return null;
  }
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  turns: Turn[],
  sessionId: string,
  attempt: number,
): Promise<ReplyTurn[] | null> {
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...toMessages(turns),
  ];

  const body = {
    model: MODEL,
    messages,
    temperature: PARAMS.temperature,
    max_tokens: PARAMS.max_tokens,
    response_format: { type: 'json_object' }, // Requires "JSON" in system prompt — already present
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    const rawText = (json?.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content;

    trace('traveler.llm_call', {
      session_id: sessionId,
      attempt,
      http_status: res.status,
      ok: res.ok,
    }, {
      prompt_version: PROMPT_VERSION,
      model: MODEL,
      params: PARAMS,
      request: {
        turn_count: turns.length,
        last_turn: turns[turns.length - 1]?.text ?? '(opening)',
      },
      response: rawText ?? json,
    });

    if (!res.ok || !rawText) return null;
    return parseReplies(rawText);
  } catch (err) {
    trace('traveler.llm_error', { session_id: sessionId, attempt, error: String(err) }, {
      prompt_version: PROMPT_VERSION,
      model: MODEL,
      params: PARAMS,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createOpenAITraveler(apiKey: string): TravelerEngine {
  return {
    name: MODEL,
    async reply(card: ScenarioCard, turns: Turn[], sessionId: string): Promise<ReplyTurn[]> {
      const systemPrompt = buildSystemPrompt(card);

      const first = await callOpenAI(apiKey, systemPrompt, turns, sessionId, 1);
      if (first && !trippedGuard(first)) return first;

      if (first && trippedGuard(first)) {
        trace('traveler.guard_tripped', { session_id: sessionId, replies: first });
        // One corrective retry with an in-character reminder
        const nudged: Turn[] = [
          ...turns,
          {
            turn_id: 'nudge',
            role: 'trainee',
            text: '(Stay fully in character; answer only as the traveler would, in their own words.)',
          },
        ];
        const second = await callOpenAI(apiKey, systemPrompt, nudged, sessionId, 2);
        if (second && !trippedGuard(second)) return second;
      }

      // Fixture fallback — session always survives
      trace('traveler.fallback_to_fixture', { session_id: sessionId });
      return fixtureTraveler.reply(card, turns, sessionId);
    },
  };
}
