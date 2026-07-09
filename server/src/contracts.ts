/**
 * TypeScript interfaces mirroring the shared JSON Schema contracts.
 * These are hand-maintained alongside shared/contracts/*.schema.json.
 */

export interface ScenarioCard {
  scenario_id: string;
  title: string;
  difficulty?: number;
  persona: {
    name: string;
    traveling_with: string;
    backstory: string;
  };
  role_play_instructions: string;
  emotional_presentation: {
    label: string;
    voice_direction?: string;
  };
  ground_truth: {
    type: 'trafficking' | 'innocent';
    indicators_present: string[];
  };
  reveal: {
    summary: string;
    teaching_points: string[];
  };
}

export interface Turn {
  turn_id: string;
  role: 'trainee' | 'traveler' | 'companion';
  text: string;
  timestamp?: string;
  audio_ref?: string | null;
}

export interface Decision {
  value: 'refer' | 'no_action';
  stated_reason?: string;
}

export interface Transcript {
  session_id: string;
  scenario_id: string;
  mode: 'text' | 'voice';
  started_at: string;
  ended_at: string;
  turns: Turn[];
  decision: Decision;
}

export interface FeedbackDimension {
  dimension_id: string;
  score: number; // 1-5
  rationale: string;
  anchors: string[]; // turn_ids
}

export interface ModeledAlternative {
  turn_id: string;
  suggested_question: string;
  why: string;
}

export interface DecisionOutcome {
  trainee_decision: 'refer' | 'no_action';
  ground_truth_type: 'trafficking' | 'innocent';
  appropriate: boolean;
  note?: string;
}

export interface FeedbackReport {
  report_id: string;
  session_id: string;
  scenario_id: string;
  rubric_version: string;
  dimensions: FeedbackDimension[];
  modeled_alternatives?: ModeledAlternative[];
  decision_outcome: DecisionOutcome;
  summary: string;
}

export interface RubricDimension {
  id: string;
  name: string;
  description: string;
}

export interface Rubric {
  version: string;
  scale: {
    min: number;
    max: number;
    meaning: string;
  };
  dimensions: RubricDimension[];
}