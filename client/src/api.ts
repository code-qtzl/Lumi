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
	/** Absent on trainee sessions — the assigned scenario stays hidden until the debrief. */
	scenario_id?: string;
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

export interface ModeledAlternative {
	turn_id: string;
	suggested_question: string;
	why: string;
}

export interface FeedbackReport {
	report_id: string;
	session_id: string;
	scenario_id: string;
	dimensions: FeedbackDimension[];
	modeled_alternatives?: ModeledAlternative[];
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
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export const getScenarios = () =>
	api<ScenarioListItem[]>('/scenarios');

// The reveal is session-scoped and only available after the decision —
// there is no public per-scenario reveal endpoint (ground truth stays hidden
// while a session could still be played against the card).
export const getSessionReveal = (session_id: string) =>
	api<ScenarioReveal>(`/sessions/${session_id}/reveal`);

// No scenario_id: the server assigns one at random and keeps it hidden —
// the trainee must not know which situation they're walking into (U1).
export const createSession = () =>
	api<SessionCreated>('/sessions', {
		method: 'POST',
		body: JSON.stringify({}),
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

// Server wraps the list: { reports: [...] } — unwrap here so callers get the
// array. (Passing the wrapper through is what broke the history view: .slice
// on an object threw and unmounted the app.)
export const getHistory = () =>
  api<{ reports: FeedbackReport[] }>('/history').then(r => r.reports);

export const clearHistory = () =>
  api<void>('/history', { method: 'DELETE' });
