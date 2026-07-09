/**
 * Session engine — core runtime logic.
 *
 * Responsibilities:
 * - Create sessions with hidden state
 * - Accept trainee turns, produce traveler replies (via fixture or real agent)
 * - Enforce decision gate (must commit refer/no_action to end)
 * - Enforce soft nudge at 20 trainee turns, hard stop at 30
 * - Assemble schema-valid transcripts
 */

import { SessionState, CreateSessionResponse, SubmitTurnResponse, EndSessionResponse } from './types';
import { getSession, setSession } from './store';
import { ScenarioCard, Turn, Transcript } from '../contracts';
import { getTravelerReply } from '../traveler/fixture';
import { trace } from '../tracing/tracer';

const SOFT_CAP = 20;  // trainee turns before nudge
const HARD_CAP = 30;  // trainee turns before auto-end

let sessionCounter = 0;

function nextSessionId(): string {
  sessionCounter++;
  const date = new Date().toISOString().slice(0, 10);
  return `sess-${date}-${String(sessionCounter).padStart(4, '0')}`;
}

function nextTurnId(turns: Turn[]): string {
  const count = turns.length + 1;
  return `t${String(count).padStart(3, '0')}`;
}

function countTraineeTurns(turns: Turn[]): number {
  return turns.filter(t => t.role === 'trainee').length;
}

/**
 * Create a new session from a scenario card.
 * Returns the session ID and the traveler's opening turn.
 */
export function createSession(scenarioCard: ScenarioCard, mode: 'text' | 'voice' = 'text'): CreateSessionResponse {
  const sessionId = nextSessionId();
  const now = new Date().toISOString();

  // Traveler speaks first
  const firstTurn: Turn = {
    turn_id: 't001',
    role: 'traveler',
    text: getTravelerReply(scenarioCard, []),
    timestamp: now,
    audio_ref: null,
  };

  const state: SessionState = {
    session_id: sessionId,
    scenario_id: scenarioCard.scenario_id,
    scenario_card: scenarioCard,
    status: 'active',
    turns: [firstTurn],
    agent_context: {
      persona: scenarioCard.persona,
      role_play_instructions: scenarioCard.role_play_instructions,
      emotional_presentation: scenarioCard.emotional_presentation,
      ground_truth_type: scenarioCard.ground_truth.type,
    },
    created_at: now,
    nudged_at_turn: null,
    capped_at_turn: HARD_CAP,
  };

  setSession(sessionId, state);

  trace('session.created', {
    session_id: sessionId,
    scenario_id: scenarioCard.scenario_id,
    mode,
  });

  return {
    session_id: sessionId,
    scenario_id: scenarioCard.scenario_id,
    mode,
    traveler_name: scenarioCard.persona.name,
    first_turn: firstTurn,
  };
}

/**
 * Submit a trainee turn and get the traveler's reply.
 * Enforces turn caps and session status.
 */
export function submitTurn(sessionId: string, text: string): SubmitTurnResponse | { error: string } {
  const state = getSession(sessionId);
  if (!state) return { error: 'Session not found' };
  if (state.status === 'completed') return { error: 'Session already completed' };

  const now = new Date().toISOString();
  const traineeTurnId = nextTurnId(state.turns);

  // Add trainee turn
  const traineeTurn: Turn = {
    turn_id: traineeTurnId,
    role: 'trainee',
    text,
    timestamp: now,
    audio_ref: null,
  };
  state.turns.push(traineeTurn);

  const traineeTurnCount = countTraineeTurns(state.turns);

  // Check hard cap
  if (traineeTurnCount >= HARD_CAP) {
    state.status = 'completed';
    state.capped_at_turn = traineeTurnCount;
    setSession(sessionId, state);

    trace('session.capped', {
      session_id: sessionId,
      trainee_turns: traineeTurnCount,
      cap: HARD_CAP,
    });

    return {
      turn: traineeTurn,
      traveler_reply: null,
      session_status: 'completed',
      nudge: 'auto_ended',
    };
  }

  // Get traveler reply
  const travelerReply: Turn = {
    turn_id: nextTurnId(state.turns),
    role: 'traveler',
    text: getTravelerReply(state.scenario_card, state.turns),
    timestamp: new Date().toISOString(),
    audio_ref: null,
  };
  state.turns.push(travelerReply);

  // Check soft nudge
  let nudge: 'consider_deciding' | undefined;
  if (traineeTurnCount >= SOFT_CAP && state.nudged_at_turn === null) {
    state.nudged_at_turn = traineeTurnCount;
    nudge = 'consider_deciding';
  }

  state.status = nudge ? 'nudged' : 'active';
  setSession(sessionId, state);

  trace('session.turn', {
    session_id: sessionId,
    turn_id: traineeTurnId,
    trainee_turn_count: traineeTurnCount,
    status: state.status,
  });

  return {
    turn: traineeTurn,
    traveler_reply: travelerReply,
    session_status: state.status,
    nudge,
  };
}

/**
 * End a session with a decision.
 * Assembles and returns the schema-valid transcript.
 */
export function endSession(sessionId: string, decision: 'refer' | 'no_action', statedReason?: string): EndSessionResponse | { error: string } {
  const state = getSession(sessionId);
  if (!state) return { error: 'Session not found' };
  if (state.status === 'completed') return { error: 'Session already completed' };

  state.status = 'completed';
  setSession(sessionId, state);

  const now = new Date().toISOString();

  const transcript: Transcript = {
    session_id: sessionId,
    scenario_id: state.scenario_id,
    mode: 'text',
    started_at: state.created_at,
    ended_at: now,
    turns: state.turns,
    decision: {
      value: decision,
      stated_reason: statedReason,
    },
  };

  trace('session.ended', {
    session_id: sessionId,
    decision,
    turn_count: state.turns.length,
  });

  return {
    session_id: sessionId,
    transcript,
    ended: true,
  };
}

/**
 * Get the current transcript for a session (for debrief).
 */
export function getTranscript(sessionId: string): Transcript | { error: string } {
  const state = getSession(sessionId);
  if (!state) return { error: 'Session not found' };

  return {
    session_id: sessionId,
    scenario_id: state.scenario_id,
    mode: 'text',
    started_at: state.created_at,
    ended_at: new Date().toISOString(),
    turns: state.turns,
    decision: { value: 'no_action' }, // placeholder until ended
  };
}