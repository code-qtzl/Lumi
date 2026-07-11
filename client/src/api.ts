/**
 * Fetch helpers for the training-sim session runtime API.
 * Mirrors server/src/session/types.ts request/response shapes.
 */

import type { Decision, FeedbackReport, ScenarioCard, ScenarioSummary, Transcript, Turn } from './contracts';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export type SessionStatus = 'active' | 'nudged' | 'awaiting_decision' | 'completed';

export interface CreateSessionResponse {
  session_id: string;
  scenario_id: string;
  mode: 'text' | 'voice';
  traveler_name: string;
  opening_turns: Turn[];
}

export interface SubmitTurnResponse {
  turn: Turn;
  traveler_turns: Turn[];
  session_status: SessionStatus;
  nudge?: 'consider_deciding' | 'decision_required';
}

export interface EndSessionResponse {
  session_id: string;
  transcript: Transcript;
  ended: true;
}

export interface FeedbackResponse {
  report: FeedbackReport;
  reveal: ScenarioCard['reveal'];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return body as T;
}

export function listScenarios(): Promise<{ scenarios: ScenarioSummary[] }> {
  return request('/api/scenarios');
}

export function createSession(scenarioId: string): Promise<CreateSessionResponse> {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ scenario_id: scenarioId, mode: 'text' }),
  });
}

export function submitTurn(sessionId: string, text: string): Promise<SubmitTurnResponse> {
  return request(`/api/sessions/${sessionId}/turn`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function endSession(sessionId: string, decision: Decision['value'], statedReason?: string): Promise<EndSessionResponse> {
  return request(`/api/sessions/${sessionId}/end`, {
    method: 'POST',
    body: JSON.stringify({ decision, stated_reason: statedReason }),
  });
}

export function getFeedback(sessionId: string): Promise<FeedbackResponse> {
  return request(`/api/sessions/${sessionId}/feedback`);
}
