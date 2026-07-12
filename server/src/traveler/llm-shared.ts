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
  /\btrafficking\b/i,
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
    // At least one traveler line, at most one companion line
    if (!replies.some(r => r.role === 'traveler')) return null;
    return replies.slice(0, 2);
  } catch {
    return null;
  }
}
