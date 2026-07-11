/**
 * TypeScript interfaces mirroring the shared JSON Schema contracts.
 * Hand-maintained alongside shared/contracts/*.schema.json and
 * server/src/contracts.ts — keep the two in sync.
 */

export interface ScenarioSummary {
  scenario_id: string;
  title: string;
}

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
  decision_outcome: DecisionOutcome;
  summary: string;
}

/** rubric.json v0.1 — dimension display names/descriptions, hand-mirrored for client display. */
export const RUBRIC_DIMENSIONS: Record<string, { name: string; description: string }> = {
  'open-questions': {
    name: 'Open vs. leading questions',
    description: 'Ratio and placement of open/invitational prompts vs. leading, suggestive, or rapid yes/no questions.',
  },
  'trauma-informed-language': {
    name: 'Trauma-informed language',
    description: "Non-accusatory tone, no blame or disbelief cues, pacing that doesn't pressure.",
  },
  'indicator-recognition': {
    name: 'Indicator recognition',
    description: 'Noticed the behavioral indicators actually present (per scenario ground truth) without inventing absent ones.',
  },
  'false-positive-discipline': {
    name: 'False-positive discipline',
    description: 'On innocent scenarios: avoided escalating on demographic or superficial cues.',
  },
  'referral-protocol': {
    name: 'Referral protocol',
    description: 'Referred/reported through the correct channel rather than confronting, accusing, or attempting rescue.',
  },
};
