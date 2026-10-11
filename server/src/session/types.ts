/**
 * Core types for the session runtime.
 *
 * session_id format: sess-YYYY-MM-DD-XXXX (human-readable, stable)
 * turn_id format: t001, t002, … (3-digit zero-padded)
 */

import type { ScenarioCard, Transcript, Turn, Decision } from '../contracts';

/**
 * 'awaiting_decision' = hard cap reached: no more turns accepted, but the
 * session is NOT over — it can only end via an explicit refer/no_action
 * decision (U3/AC6: the decision gate).
 */
export type SessionStatus = 'active' | 'nudged' | 'awaiting_decision' | 'completed';

/** Hidden runtime state — never exposed to the client. */
export interface SessionState {
  session_id: string;
  /** Anonymous trainee id (see identity.ts); only the owner can read or play it. */
  owner_id: string;
  scenario_id: string;
  scenario_card: ScenarioCard;
  status: SessionStatus;
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
  /** Trainee-turn count at which the hard cap fired, or null if not reached. */
  capped_at_turn: number | null;
  /** Set once the session ends via a decision; the transcript of record. */
  final_transcript: Transcript | null;
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
  /** Traveler speaks first; may include a companion turn per the card. */
  opening_turns: Turn[];
}

export interface SubmitTurnRequest {
  text: string;
}

export interface SubmitTurnResponse {
  turn: Turn;
  /** Traveler reply plus, when the card has one, a companion interjection. Empty when the hard cap fires. */
  traveler_turns: Turn[];
  session_status: SessionStatus;
  nudge?: 'consider_deciding' | 'decision_required';
}

/** Mid-session view for rehydration — no decision, no ground truth. */
export interface SessionView {
  session_id: string;
  scenario_id: string;
  status: SessionStatus;
  turns: Turn[];
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