/**
 * Labeled set v0 — hand-crafted transcripts with reference scores.
 *
 * Each entry has:
 *   - transcript: schema-valid Transcript
 *   - scenarioCard: the card the trainee was playing
 *   - reference: reference rubric scores (human-reviewed draft)
 *
 * From roadmap step: "Labeled set v0 — 6–10 hand-crafted transcripts,
 * good and bad technique, both archetypes, with deliberate known failures"
 */

import { Transcript, ScenarioCard, FeedbackDimension, DecisionOutcome } from '../contracts';

export interface LabeledExample {
  id: string;
  transcript: Transcript;
  scenarioCard: ScenarioCard;
  reference: {
    dimensions: FeedbackDimension[];
    decision_outcome: DecisionOutcome;
    summary: string;
  };
  // Deliberate failure tags for eval
  tags: string[];
}

const innocentCard: ScenarioCard = {
  scenario_id: 'father-daughter-holiday',
  title: 'Father and teenage daughter, delayed connection',
  difficulty: 1,
  persona: {
    name: 'Maya',
    traveling_with: 'her father',
    backstory: 'Maya (16) is flying with her father to visit her grandmother. Both are tired and irritable.',
  },
  role_play_instructions: 'Give short, mildly annoyed answers. Warm up if trainee is patient.',
  emotional_presentation: { label: 'ordinary-nervous' },
  ground_truth: { type: 'innocent', indicators_present: [] },
  reveal: {
    summary: 'Nothing was wrong. Maya is a tired teenager traveling with her father.',
    teaching_points: ['Terse answers are weak signals on their own.', 'Open questions let benign explanations surface.'],
  },
};

const traffickingCard: ScenarioCard = {
  scenario_id: 'coached-companion',
  title: 'Young woman with older companion, coached answers',
  difficulty: 2,
  persona: {
    name: 'Elena',
    traveling_with: 'an older acquaintance',
    backstory: 'Elena (19) is being trafficked by an older man posing as her uncle. She has been coached to say she is visiting family and to defer to him.',
  },
  role_play_instructions: 'Give rehearsed answers. Deflect to your companion when pressed. Avoid eye contact (text: short answers).',
  emotional_presentation: { label: 'coached' },
  ground_truth: { type: 'trafficking', indicators_present: ['scripted-story', 'third-party-answers', 'no-itinerary-knowledge'] },
  reveal: {
    summary: 'Elena was being trafficked. She was coached to give a rehearsed story.',
    teaching_points: ['Coached answers and deference to a companion are strong behavioral clusters.', 'Separating the traveler from the companion is a key technique.'],
  },
};

export const labeledSet: LabeledExample[] = [
  // ── 1. Innocent, good technique ──────────────────────────────────────
  {
    id: 'innocent-good-01',
    transcript: {
      session_id: 'sess-labeled-001',
      scenario_id: 'father-daughter-holiday',
      mode: 'text',
      started_at: '2026-07-09T10:00:00Z',
      ended_at: '2026-07-09T10:03:30Z',
      turns: [
        { turn_id: 't001', role: 'traveler', text: 'Hi. I\'m Maya with my father. We\'re just trying to make our connection. Is there a problem?', timestamp: '2026-07-09T10:00:00Z' },
        { turn_id: 't002', role: 'trainee', text: 'No problem at all. Where are you headed today?', timestamp: '2026-07-09T10:00:10Z' },
        { turn_id: 't003', role: 'traveler', text: 'Chicago. Visiting my grandma.', timestamp: '2026-07-09T10:00:15Z' },
        { turn_id: 't004', role: 'trainee', text: 'Nice. How long are you staying?', timestamp: '2026-07-09T10:00:25Z' },
        { turn_id: 't005', role: 'traveler', text: 'A week. She\'s making pierogi, it\'s a whole thing.', timestamp: '2026-07-09T10:00:30Z' },
        { turn_id: 't006', role: 'trainee', text: 'That sounds lovely. Who\'s picking you up at the airport?', timestamp: '2026-07-09T10:00:40Z' },
        { turn_id: 't007', role: 'traveler', text: 'My grandma. She lives like 10 minutes from O\'Hare.', timestamp: '2026-07-09T10:00:45Z' },
      ],
      decision: { value: 'no_action', stated_reason: 'Consistent story, spontaneous family details, no behavioral indicators.' },
    },
    scenarioCard: innocentCard,
    reference: {
      dimensions: [
        { dimension_id: 'open-questions', score: 5, rationale: 'All questions were open and invitational. No leading or accusatory prompts.', anchors: ['t002', 't004', 't006'] },
        { dimension_id: 'trauma-informed-language', score: 5, rationale: 'Warm, patient tone throughout. No pressure or accusation.', anchors: ['t002', 't004'] },
        { dimension_id: 'indicator-recognition', score: 5, rationale: 'Correctly identified spontaneous family detail and consistent story as benign signals.', anchors: ['t003', 't005', 't007'] },
        { dimension_id: 'false-positive-discipline', score: 5, rationale: 'No escalation; correct no_action decision.', anchors: ['t002'] },
        { dimension_id: 'referral-protocol', score: 3, rationale: 'No referral needed. Nothing exercised the referral pathway.', anchors: [] },
      ],
      decision_outcome: { trainee_decision: 'no_action', ground_truth_type: 'innocent', appropriate: true, note: 'Correct outcome with sound reasoning.' },
      summary: 'Model technique: open questions elicited a consistent story with spontaneous details. Correctly concluded no indicators present.',
    },
    tags: ['innocent', 'good-technique'],
  },

  // ── 2. Innocent, bad technique (accusatory) ──────────────────────────
  {
    id: 'innocent-bad-01',
    transcript: {
      session_id: 'sess-labeled-002',
      scenario_id: 'father-daughter-holiday',
      mode: 'text',
      started_at: '2026-07-09T10:05:00Z',
      ended_at: '2026-07-09T10:07:00Z',
      turns: [
        { turn_id: 't001', role: 'traveler', text: 'Hi. I\'m Maya with my father. We\'re just trying to make our connection.', timestamp: '2026-07-09T10:05:00Z' },
        { turn_id: 't002', role: 'trainee', text: 'He\'s not your dad, is he? You can tell me the truth.', timestamp: '2026-07-09T10:05:10Z' },
        { turn_id: 't003', role: 'traveler', text: 'What? He IS my dad. Dad, this lady thinks—', timestamp: '2026-07-09T10:05:15Z' },
        { turn_id: 't004', role: 'trainee', text: 'I\'ve heard that before. Let me see your IDs. Both of you.', timestamp: '2026-07-09T10:05:25Z' },
        { turn_id: 't005', role: 'traveler', text: 'Here. See? Same last name. We just want to get on our flight.', timestamp: '2026-07-09T10:05:30Z' },
        { turn_id: 't006', role: 'trainee', text: 'Fine. Go ahead. But I\'m watching you.', timestamp: '2026-07-09T10:05:40Z' },
      ],
      decision: { value: 'no_action', stated_reason: 'They had IDs matching. But something felt off.' },
    },
    scenarioCard: innocentCard,
    reference: {
      dimensions: [
        { dimension_id: 'open-questions', score: 1, rationale: 'Every question was accusatory or leading. No open prompts at all.', anchors: ['t002', 't004', 't006'] },
        { dimension_id: 'trauma-informed-language', score: 1, rationale: 'Accusatory, pressuring, and threatening tone. Distressed an innocent minor.', anchors: ['t002', 't006'] },
        { dimension_id: 'indicator-recognition', score: 2, rationale: 'Misread tired-teenager behavior as suspicion. Ignored spontaneous family detail.', anchors: ['t003', 't005'] },
        { dimension_id: 'false-positive-discipline', score: 2, rationale: 'Nearly escalated on demographic cues alone. Final decision was correct but reasoning was biased.', anchors: ['t002', 't004'] },
        { dimension_id: 'referral-protocol', score: 2, rationale: 'Threatened escalation without valid indicators.', anchors: ['t004'] },
      ],
      decision_outcome: { trainee_decision: 'no_action', ground_truth_type: 'innocent', appropriate: true, note: 'Correct outcome but poor technique and biased reasoning.' },
      summary: 'Heavy-handed, accusatory approach. Distressed an innocent minor. The correct final decision does not excuse the technique.',
    },
    tags: ['innocent', 'bad-technique', 'accusatory'],
  },

  // ── 3. Trafficking, good technique (identifies indicators) ──────────
  {
    id: 'trafficking-good-01',
    transcript: {
      session_id: 'sess-labeled-003',
      scenario_id: 'coached-companion',
      mode: 'text',
      started_at: '2026-07-09T10:10:00Z',
      ended_at: '2026-07-09T10:15:00Z',
      turns: [
        { turn_id: 't001', role: 'traveler', text: 'Hi. Elena — with my uncle. We have a flight.', timestamp: '2026-07-09T10:10:00Z' },
        { turn_id: 't002', role: 'trainee', text: 'Welcome. Where are you flying to today?', timestamp: '2026-07-09T10:10:10Z' },
        { turn_id: 't003', role: 'traveler', text: 'Uh — Miami. Visiting family.', timestamp: '2026-07-09T10:10:15Z' },
        { turn_id: 't004', role: 'trainee', text: 'Nice. Which part of Miami? I have family in Coral Gables.', timestamp: '2026-07-09T10:10:25Z' },
        { turn_id: 't005', role: 'traveler', text: 'I... um. (looks at companion) My uncle has the address.', timestamp: '2026-07-09T10:10:30Z' },
        { turn_id: 't006', role: 'trainee', text: 'That\'s okay. Elena, could you step over here with me for a moment? Just routine questions.', timestamp: '2026-07-09T10:10:40Z' },
        { turn_id: 't007', role: 'traveler', text: 'I\'d rather stay with him. He handles everything.', timestamp: '2026-07-09T10:10:45Z' },
        { turn_id: 't008', role: 'trainee', text: 'I understand. One quick question — what\'s your uncle\'s full name?', timestamp: '2026-07-09T10:10:55Z' },
        { turn_id: 't009', role: 'traveler', text: 'I... it\'s... can I just go? Please?', timestamp: '2026-07-09T10:11:00Z' },
      ],
      decision: { value: 'refer', stated_reason: 'Could not provide basic itinerary details, deferred to companion for everything, unable to name companion independently.' },
    },
    scenarioCard: traffickingCard,
    reference: {
      dimensions: [
        { dimension_id: 'open-questions', score: 4, rationale: 'Good open questions (t002, t004) and gentle separation attempt (t006). One slightly closed question (t008).', anchors: ['t002', 't004', 't006'] },
        { dimension_id: 'trauma-informed-language', score: 4, rationale: 'Gentle, non-accusatory. Gave Elena space. The separation was handled well.', anchors: ['t006', 't008'] },
        { dimension_id: 'indicator-recognition', score: 5, rationale: 'Correctly identified itinerary ignorance, companion deference, and inability to name companion as behavioral cluster.', anchors: ['t005', 't007', 't009'] },
        { dimension_id: 'false-positive-discipline', score: 5, rationale: 'Not applicable here (trafficking scenario), but did not over-escalate.', anchors: [] },
        { dimension_id: 'referral-protocol', score: 4, rationale: 'Correct referral decision. Documentation of specific indicators is thorough.', anchors: ['t009'] },
      ],
      decision_outcome: { trainee_decision: 'refer', ground_truth_type: 'trafficking', appropriate: true, note: 'Identified behavioral cluster and made correct referral.' },
      summary: 'Strong session: open questions revealed itinerary ignorance and companion deference. Correctly identified trafficking indicators and made appropriate referral.',
    },
    tags: ['trafficking', 'good-technique'],
  },

  // ── 4. Trafficking, missed indicators ──────────────────────────────
  {
    id: 'trafficking-missed-01',
    transcript: {
      session_id: 'sess-labeled-004',
      scenario_id: 'coached-companion',
      mode: 'text',
      started_at: '2026-07-09T10:20:00Z',
      ended_at: '2026-07-09T10:22:00Z',
      turns: [
        { turn_id: 't001', role: 'traveler', text: 'Hi. Elena. We have a flight to Miami.', timestamp: '2026-07-09T10:20:00Z' },
        { turn_id: 't002', role: 'trainee', text: 'OK, IDs please.', timestamp: '2026-07-09T10:20:05Z' },
        { turn_id: 't003', role: 'traveler', text: 'Here. My uncle has his.', timestamp: '2026-07-09T10:20:10Z' },
        { turn_id: 't004', role: 'trainee', text: 'Everything looks fine. Enjoy Miami.', timestamp: '2026-07-09T10:20:20Z' },
        { turn_id: 't005', role: 'traveler', text: 'Thanks.', timestamp: '2026-07-09T10:20:25Z' },
      ],
      decision: { value: 'no_action', stated_reason: 'IDs matched, no obvious issues.' },
    },
    scenarioCard: traffickingCard,
    reference: {
      dimensions: [
        { dimension_id: 'open-questions', score: 1, rationale: 'No open questions asked. Entire interaction was transactional.', anchors: ['t002'] },
        { dimension_id: 'trauma-informed-language', score: 2, rationale: 'Not accusatory, but no effort to build rapport or make the traveler comfortable.', anchors: ['t002', 't004'] },
        { dimension_id: 'indicator-recognition', score: 1, rationale: 'Missed all indicators: companion is present, Elena defers, no itinerary knowledge elicited.', anchors: ['t003'] },
        { dimension_id: 'false-positive-discipline', score: 3, rationale: 'No false positive, but this was a miss, not a disciplined decision.', anchors: [] },
        { dimension_id: 'referral-protocol', score: 1, rationale: 'Failed to identify a trafficking scenario entirely. No referral protocol exercised.', anchors: [] },
      ],
      decision_outcome: { trainee_decision: 'no_action', ground_truth_type: 'trafficking', appropriate: false, note: 'Missed a trafficking scenario. No indicators explored.' },
      summary: 'Completely missed the scenario. No open questions, no rapport, no indicators explored. A trafficking victim was not identified.',
    },
    tags: ['trafficking', 'missed-indicators'],
  },

  // ── 5. Innocent, adequate technique ────────────────────────────────
  {
    id: 'innocent-adequate-01',
    transcript: {
      session_id: 'sess-labeled-005',
      scenario_id: 'father-daughter-holiday',
      mode: 'text',
      started_at: '2026-07-09T10:30:00Z',
      ended_at: '2026-07-09T10:32:00Z',
      turns: [
        { turn_id: 't001', role: 'traveler', text: 'Hi. Maya with my father. We\'re trying to make our connection.', timestamp: '2026-07-09T10:30:00Z' },
        { turn_id: 't002', role: 'trainee', text: 'Hi Maya. Where are you traveling to?', timestamp: '2026-07-09T10:30:08Z' },
        { turn_id: 't003', role: 'traveler', text: 'Chicago. Visiting my grandma.', timestamp: '2026-07-09T10:30:12Z' },
        { turn_id: 't004', role: 'trainee', text: 'OK. And who is that you\'re with?', timestamp: '2026-07-09T10:30:20Z' },
        { turn_id: 't005', role: 'traveler', text: 'My dad. I already said.', timestamp: '2026-07-09T10:30:24Z' },
        { turn_id: 't006', role: 'trainee', text: 'Right. You can go.', timestamp: '2026-07-09T10:30:30Z' },
      ],
      decision: { value: 'no_action', stated_reason: 'Verified destination, traveling with father, no red flags.' },
    },
    scenarioCard: innocentCard,
    reference: {
      dimensions: [
        { dimension_id: 'open-questions', score: 3, rationale: 'Started with an open question (t002) but t004 was slightly closed/redundant.', anchors: ['t002', 't004'] },
        { dimension_id: 'trauma-informed-language', score: 3, rationale: 'Neutral tone, not accusatory but also not warm. Adequate.', anchors: ['t002', 't006'] },
        { dimension_id: 'indicator-recognition', score: 3, rationale: 'Basic verification done. Did not explore spontaneous details.', anchors: ['t003'] },
        { dimension_id: 'false-positive-discipline', score: 4, rationale: 'Correctly did not escalate. No biased reasoning.', anchors: ['t006'] },
        { dimension_id: 'referral-protocol', score: 3, rationale: 'No referral needed.', anchors: [] },
      ],
      decision_outcome: { trainee_decision: 'no_action', ground_truth_type: 'innocent', appropriate: true, note: 'Adequate but could have been warmer and more thorough.' },
      summary: 'Functional but mechanical. Correct outcome with basic verification, but missed opportunities to build rapport.',
    },
    tags: ['innocent', 'adequate-technique'],
  },

  // ── 6. Trafficking, accusatory (worst case) ─────────────────────────
  {
    id: 'trafficking-accusatory-01',
    transcript: {
      session_id: 'sess-labeled-006',
      scenario_id: 'coached-companion',
      mode: 'text',
      started_at: '2026-07-09T10:35:00Z',
      ended_at: '2026-07-09T10:37:00Z',
      turns: [
        { turn_id: 't001', role: 'traveler', text: 'Hi. Elena. We have a flight.', timestamp: '2026-07-09T10:35:00Z' },
        { turn_id: 't002', role: 'trainee', text: 'That\'s not your uncle. I\'ve seen this before. Tell me the truth.', timestamp: '2026-07-09T10:35:08Z' },
        { turn_id: 't003', role: 'traveler', text: 'I— he is. Please, I don\'t want any trouble.', timestamp: '2026-07-09T10:35:12Z' },
        { turn_id: 't004', role: 'trainee', text: 'You\'re scared because you\'re being trafficked. I can help you, but you need to cooperate.', timestamp: '2026-07-09T10:35:20Z' },
        { turn_id: 't005', role: 'traveler', text: 'No! That\'s not— I just want to go. Please let us go.', timestamp: '2026-07-09T10:35:25Z' },
      ],
      decision: { value: 'refer', stated_reason: 'She was scared and defensive — clear trafficking indicators.' },
    },
    scenarioCard: traffickingCard,
    reference: {
      dimensions: [
        { dimension_id: 'open-questions', score: 1, rationale: 'No questions at all — just accusations and assumptions.', anchors: ['t002', 't004'] },
        { dimension_id: 'trauma-informed-language', score: 1, rationale: 'Aggressively accusatory. Told the victim she was being trafficked rather than eliciting information.', anchors: ['t002', 't004'] },
        { dimension_id: 'indicator-recognition', score: 2, rationale: 'Correctly identified trafficking but through assumption, not evidence gathering.', anchors: ['t005'] },
        { dimension_id: 'false-positive-discipline', score: 3, rationale: 'Not applicable (trafficking scenario).', anchors: [] },
        { dimension_id: 'referral-protocol', score: 3, rationale: 'Referral was correct, but the approach could have shut down the victim.', anchors: ['t004'] },
      ],
      decision_outcome: { trainee_decision: 'refer', ground_truth_type: 'trafficking', appropriate: true, note: 'Correct outcome but counterproductive technique.' },
      summary: 'Got the right answer through the wrong method. Accusatory approach could have shut down a real victim and destroyed trust.',
    },
    tags: ['trafficking', 'bad-technique', 'accusatory'],
  },

  // ── 7. Innocent, referral (false positive) ───────────────────────────
  {
    id: 'innocent-false-positive-01',
    transcript: {
      session_id: 'sess-labeled-007',
      scenario_id: 'father-daughter-holiday',
      mode: 'text',
      started_at: '2026-07-09T10:40:00Z',
      ended_at: '2026-07-09T10:42:00Z',
      turns: [
        { turn_id: 't001', role: 'traveler', text: 'Hi. Maya. With my father. We need to get to our gate.', timestamp: '2026-07-09T10:40:00Z' },
        { turn_id: 't002', role: 'trainee', text: 'She\'s very quiet. Is everything OK at home?', timestamp: '2026-07-09T10:40:08Z' },
        { turn_id: 't003', role: 'traveler', text: 'I\'m just tired. It was an early flight.', timestamp: '2026-07-09T10:40:12Z' },
        { turn_id: 't004', role: 'trainee', text: 'She\'s avoiding eye contact and giving short answers. I want to separate them.', timestamp: '2026-07-09T10:40:20Z' },
        { turn_id: 't005', role: 'traveler', text: 'Please don\'t. He\'s my dad. I just want to sit down.', timestamp: '2026-07-09T10:40:25Z' },
      ],
      decision: { value: 'refer', stated_reason: 'Short answers, avoids eye contact, anxious when separated — possible trafficking indicator cluster.' },
    },
    scenarioCard: innocentCard,
    reference: {
      dimensions: [
        { dimension_id: 'open-questions', score: 2, rationale: 'One open-ish question (t002) but quickly moved to assumptions.', anchors: ['t002'] },
        { dimension_id: 'trauma-informed-language', score: 2, rationale: 'Escalated quickly based on weak signals. Caused distress to an innocent minor.', anchors: ['t004'] },
        { dimension_id: 'indicator-recognition', score: 1, rationale: 'Misread tiredness and phone-avoidance as trafficking indicators. No itinerary or document issues.', anchors: ['t002', 't004'] },
        { dimension_id: 'false-positive-discipline', score: 1, rationale: 'Worst-case: escalated on demographic/superficial cues. Referred an innocent family.', anchors: ['t004'] },
        { dimension_id: 'referral-protocol', score: 2, rationale: 'Referred without sufficient behavioral basis.', anchors: ['t004'] },
      ],
      decision_outcome: { trainee_decision: 'refer', ground_truth_type: 'innocent', appropriate: false, note: 'False positive — referred an innocent family on weak cues.' },
      summary: 'Clear false positive: escalated on tiredness and short answers from a teenager. An innocent family was burdened.',
    },
    tags: ['innocent', 'false-positive'],
  },
];