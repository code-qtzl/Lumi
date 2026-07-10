/**
 * Traveler engine seam — the session engine talks to travelers only through
 * this interface, so fixture and LLM implementations are interchangeable
 * (F7: fixture mode must always work with no keys).
 */

import { ScenarioCard, Turn } from '../contracts';

/** One reply utterance. A single exchange may produce a traveler turn and, per the card, a companion turn. */
export interface ReplyTurn {
  role: 'traveler' | 'companion';
  text: string;
}

export interface TravelerEngine {
  /** Human-readable name recorded in traces ('fixture' or a pinned model string). */
  readonly name: string;
  /**
   * Produce the next reply given the conversation so far.
   * `turns` is empty for the opening line. Implementations must never throw —
   * degrade to a safe in-character line instead (the session must survive).
   */
  reply(card: ScenarioCard, turns: Turn[], sessionId: string): Promise<ReplyTurn[]>;
}
