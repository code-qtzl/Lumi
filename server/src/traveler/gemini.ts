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
import { fixtureTraveler } from './fixture';
import { buildSystemPrompt, OPENING_CUE, PROMPT_VERSION } from './prompt';
import { trace } from '../tracing/tracer';

const MODEL = process.env.TRAVELER_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = 10_000;
const PARAMS = { temperature: 0.8, maxOutputTokens: 300 };

/**
 * Never-reveal guard (F2): an in-character traveler has no reason to say any
 * of these. A hit means the model broke character — retry once with a
 * corrective nudge, then fall back to an in-character deflection.
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

function toContents(turns: Turn[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  if (turns.length === 0) {
    return [{ role: 'user', parts: [{ text: OPENING_CUE }] }];
  }
  return turns.map(t => ({
    role: t.role === 'trainee' ? 'user' : 'model',
    parts: [{ text: t.role === 'companion' ? `[companion] ${t.text}` : t.text }],
  }));
}

function parseReplies(raw: string): ReplyTurn[] | null {
  // Strip markdown fences if the model added them despite instructions
  const cleaned = raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const replies: ReplyTurn[] = [];
    for (const item of arr) {
      if (typeof item?.text !== 'string' || item.text.trim().length === 0) return null;
      const role = item.speaker === 'companion' ? 'companion' : 'traveler';
      replies.push({ role, text: item.text.trim() });
    }
    // At least one traveler line, at most one companion line
    if (!replies.some(r => r.role === 'traveler')) return null;
    return replies.slice(0, 2);
  } catch {
    return null;
  }
}

async function callGemini(apiKey: string, systemPrompt: string, turns: Turn[], sessionId: string, attempt: number): Promise<ReplyTurn[] | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: toContents(turns),
    generationConfig: { ...PARAMS, responseMimeType: 'application/json' },
  };

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
    const rawText: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    trace('traveler.llm_call', { session_id: sessionId, attempt, http_status: res.status, ok: res.ok }, {
      prompt_version: PROMPT_VERSION,
      model: MODEL,
      params: PARAMS,
      // Log the conversation shape, not the full system prompt every turn (it's card-derived and versioned)
      request: { turn_count: turns.length, last_turn: turns[turns.length - 1]?.text ?? '(opening)' },
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

export function createGeminiTraveler(apiKey: string): TravelerEngine {
  return {
    name: MODEL,
    async reply(card: ScenarioCard, turns: Turn[], sessionId: string): Promise<ReplyTurn[]> {
      const systemPrompt = buildSystemPrompt(card);

      const first = await callGemini(apiKey, systemPrompt, turns, sessionId, 1);
      if (first && !trippedGuard(first)) return first;

      if (first && trippedGuard(first)) {
        trace('traveler.guard_tripped', { session_id: sessionId, replies: first });
        // One corrective retry: re-ask with an appended in-character reminder
        const nudged: Turn[] = [
          ...turns,
          { turn_id: 'nudge', role: 'trainee', text: '(Stay fully in character; answer only as the traveler would, in their own words.)' },
        ];
        const second = await callGemini(apiKey, systemPrompt, nudged, sessionId, 2);
        if (second && !trippedGuard(second)) return second;
      }

      // Fall back to the fixture for this turn — session survives, trace records why
      trace('traveler.fallback_to_fixture', { session_id: sessionId });
      return fixtureTraveler.reply(card, turns, sessionId);
    },
  };
}
