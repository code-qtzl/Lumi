// Typed API client — all calls go through the Vite proxy at /api

const BASE = '/api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScenarioListItem {
	scenario_id: string;
	title: string;
	difficulty?: number;
}

export interface ScenarioReveal {
	scenario_id: string;
	title: string;
	persona: { name: string; traveling_with: string };
	ground_truth: { type: 'trafficking' | 'innocent'; indicators_present: string[] };
	reveal: { summary: string; teaching_points: string[] };
	emotional_presentation: { label: string };
}

export interface Turn {
	turn_id: string;
	role: 'trainee' | 'traveler' | 'companion';
	text: string;
	timestamp?: string;
}

export interface SessionCreated {
	session_id: string;
	scenario_id: string;
	traveler_name: string;
	opening_turns: Turn[];
}

export interface TurnResult {
	turn: Turn;
	traveler_turns: Turn[];
	session_status: string;
	nudge?: 'consider_deciding' | 'decision_required';
}

export interface SessionEnded {
	session_id: string;
	ended: boolean;
	transcript: {
		turns: Turn[];
		decision: { value: 'refer' | 'no_action'; stated_reason?: string };
	};
}

export interface FeedbackDimension {
	dimension_id: string;
	score: number;
	rationale: string;
	anchors: string[];
}

export interface FeedbackReport {
	report_id: string;
	session_id: string;
	scenario_id: string;
	dimensions: FeedbackDimension[];
	decision_outcome: {
		trainee_decision: 'refer' | 'no_action';
		ground_truth_type: 'trafficking' | 'innocent';
		appropriate: boolean;
		note?: string;
	};
	summary: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { 'Content-Type': 'application/json', ...init?.headers },
		...init,
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
	}
	return res.json() as Promise<T>;
}

export const getScenarios = () =>
	api<ScenarioListItem[]>('/scenarios');

export const getScenarioReveal = (id: string) =>
	api<ScenarioReveal>(`/scenarios/${id}/reveal`);

export const createSession = (scenario_id: string) =>
	api<SessionCreated>('/sessions', {
		method: 'POST',
		body: JSON.stringify({ scenario_id }),
	});

export const submitTurn = (session_id: string, text: string) =>
	api<TurnResult>(`/sessions/${session_id}/turn`, {
		method: 'POST',
		body: JSON.stringify({ text }),
	});

export const endSession = (
	session_id: string,
	decision: 'refer' | 'no_action',
	stated_reason?: string,
) =>
	api<SessionEnded>(`/sessions/${session_id}/end`, {
		method: 'POST',
		body: JSON.stringify({ decision, stated_reason }),
	});

export const requestFeedback = (session_id: string) =>
	api<FeedbackReport>(`/sessions/${session_id}/feedback`, { method: 'POST' });
