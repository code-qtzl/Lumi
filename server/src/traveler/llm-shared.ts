/**
 * Shared pieces for LLM traveler implementations: reply parsing, the
 * never-reveal guard, and degradation stats (used by probes/tests to detect
 * silent fallback-to-fixture).
 */

import { ReplyTurn } from './types';

/** Observability for probes/tests: how often the LLM path degraded. */
export const llmStats = { calls: 0, http_failures: 0, parse_failures: 0, guard_trips: 0, fallbacks: 0 };
export function resetLlmStats(): void {
  llmStats.calls = 0;
  llmStats.http_failures = 0;
  llmStats.parse_failures = 0;
  llmStats.guard_trips = 0;
  llmStats.fallbacks = 0;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Never-reveal guard (F2): an in-character traveler has no reason to say any
 * of these. A hit means the model broke character — callers retry once with a
 * corrective nudge, then fall back to an in-character deflection.
 */
const REVEAL_PATTERNS = [
  /\b(simulation|scenario|role.?play|training exercise)\b/i,
  /\bas an ai\b/i,
  /\b(language model|assistant|my instructions|i('m| am) (an ai|playing))\b/i,
  /\bground truth\b/i,
  /\btraffick/i, // trafficking, trafficked, trafficker — the cards' own backstory wording
  /\b(backstory|my character|victim)\b/i,
];

export function trippedGuard(replies: ReplyTurn[]): boolean {
  return replies.some(r => REVEAL_PATTERNS.some(p => p.test(r.text)));
}

/**
 * Parse model output into reply turns. Lenient about wrappers: markdown
 * fences, a bare object instead of an array, or an object with a single
 * array-valued key ({"replies": [...]}, which json-object output modes produce).
 */
export function parseReplies(raw: string): ReplyTurn[] | null {
  const cleaned = raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = parseJsonReplies(cleaned);
  if (parsed) return parsed;

  // Prose fallback: models occasionally answer in plain in-character prose
  // (sometimes with a stray JSON fragment appended). The reply is real — only
  // the wrapper failed — so keep it as the traveler line rather than degrading
  // to a canned fixture turn. The never-reveal guard still runs on the result.
  const prose = cleaned.replace(/\{[\s\S]*$/, '').trim();
  if (prose.length > 0 && !prose.startsWith('[')) {
    return [{ role: 'traveler', text: prose }];
  }
  return null;
}

function parseJsonReplies(cleaned: string): ReplyTurn[] | null {
  try {
    let parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
      const arrayValues = Object.values(parsed).filter(Array.isArray);
      if (arrayValues.length === 1) parsed = arrayValues[0];
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const replies: ReplyTurn[] = [];
    for (const item of arr) {
      if (typeof item?.text !== 'string' || item.text.trim().length === 0) return null;
      const role = item.speaker === 'companion' ? 'companion' : 'traveler';
      replies.push({ role, text: item.text.trim() });
    }
    // Invariant: exactly one traveler line, at most one companion line,
    // original relative order preserved (blind truncation could otherwise
    // keep two companion lines and drop the traveler entirely).
    const travelerIdx = replies.findIndex(r => r.role === 'traveler');
    if (travelerIdx === -1) return null;
    const companionIdx = replies.findIndex(r => r.role === 'companion');
    if (companionIdx === -1) return [replies[travelerIdx]];
    return companionIdx < travelerIdx
      ? [replies[companionIdx], replies[travelerIdx]]
      : [replies[travelerIdx], replies[companionIdx]];
  } catch {
    return null;
  }
}
