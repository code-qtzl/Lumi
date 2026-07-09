/**
 * Core types for the session runtime.
 *
 * session_id format: sess-YYYY-MM-DD-XXXX (human-readable, stable)
 * turn_id format: t001, t002, … (3-digit zero-padded)
 */

import type { ScenarioCard, Transcript, Turn, Decision } from '../contracts';

/** Hidden runtime state — never exposed to the client. */
export interface SessionState {
  session_id: string;
  scenario_id: string;
  scenario_card: ScenarioCard;
  status: 'active' | 'nudged' | 'completed';
  turns: Turn[];
  /** Dehydrated scenario card data the role-play agent needs (no reveal). */
  agent_context: {
    persona: ScenarioCard['persona'];
    role_play_instructions: string;
    emotional_presentation: ScenarioCard['emotional_presentation'];
    ground_truth_type: string;
  };
  created_at: string;
  /** Soft cap reached — we've sent the "consider deciding" nudge. */
  nudged_at_turn: number | null;
  /** Hard cap reached — session automatically ends after this turn. */
  capped_at_turn: number;
}

export interface CreateSessionRequest {
  scenario_id: string;
  mode?: 'text' | 'voice';
}

export interface CreateSessionResponse {
  session_id: string;
  scenario_id: string;
  mode: 'text' | 'voice';
  traveler_name: string;
  first_turn: Turn;
}

export interface SubmitTurnRequest {
  text: string;
}

export interface SubmitTurnResponse {
  turn: Turn;
  traveler_reply: Turn | null;
  session_status: 'active' | 'nudged' | 'completed';
  nudge?: 'consider_deciding' | 'auto_ended';
}

export interface EndSessionRequest {
  decision: Decision['value'];
  stated_reason?: string;
}

export interface EndSessionResponse {
  session_id: string;
  transcript: Transcript;
  ended: true;
}