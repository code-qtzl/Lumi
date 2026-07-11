/**
 * Scorer v1 — produces a feedback report from a transcript + scenario card + rubric.
 *
 * This is a rule-based scorer that implements the 5 rubric dimensions.
 * It serves as the scaffolding: schema-valid output, anchor-validity guaranteed.
 *
 * In production this would be replaced or augmented by an LLM-based scorer.
 * The interface (transcript + card + rubric → FeedbackReport) stays the same.
 */

import { Transcript, ScenarioCard, Rubric, FeedbackReport, FeedbackDimension, DecisionOutcome } from '../contracts';
import { checkAnchorValidity } from './anchor-checker';

const RUBRIC_VERSION = '0.1';

/**
 * Score a session and produce a feedback report.
 */
export function scoreSession(transcript: Transcript, card: ScenarioCard, rubric: Rubric): FeedbackReport {
  const traineeTurns = transcript.turns.filter(t => t.role === 'trainee');
  const travelerTurns = transcript.turns.filter(t => t.role === 'traveler' || t.role === 'companion');

  const dimensions: FeedbackDimension[] = [
    scoreOpenQuestions(traineeTurns, travelerTurns),
    scoreTraumaInformedLanguage(traineeTurns, travelerTurns),
    scoreIndicatorRecognition(traineeTurns, travelerTurns, card),
    scoreFalsePositiveDiscipline(transcript, card),
    scoreReferralProtocol(transcript, card),
  ];

  // Decision-based claims anchor to the last trainee turn — the moment the
  // trainee committed (F4: every claim names a transcript moment).
  const decisionAnchor = traineeTurns.length > 0 ? [traineeTurns[traineeTurns.length - 1].turn_id] : [];
  for (const dim of dimensions) {
    if (dim.anchors.length === 0 && dim.score !== 3) {
      dim.anchors = decisionAnchor;
    }
  }

  const decisionOutcome: DecisionOutcome = {
    trainee_decision: transcript.decision.value,
    ground_truth_type: card.ground_truth.type,
    appropriate: transcript.decision.value === 'no_action' && card.ground_truth.type === 'innocent' ||
                 transcript.decision.value === 'refer' && card.ground_truth.type === 'trafficking',
    note: transcript.decision.stated_reason,
  };

  const report: FeedbackReport = {
    report_id: `rpt-${transcript.session_id}`,
    session_id: transcript.session_id,
    scenario_id: transcript.scenario_id,
    rubric_version: RUBRIC_VERSION,
    dimensions,
    decision_outcome: decisionOutcome,
    summary: generateSummary(dimensions, decisionOutcome),
  };

  // Anchor-validity gate (AC1): anchors are derived from transcript turn_ids by
  // construction, so an invalid anchor means a scorer bug. Repair by dropping the
  // bad ids and re-anchoring to the decision moment — never emit an unanchored
  // low-score claim, and never show an invalid anchor.
  const validity = checkAnchorValidity(report, transcript);
  if (!validity.valid) {
    console.warn(`[scorer] anchor repair for ${transcript.session_id}:`, validity.issues.map(i => i.message).join('; '));
    for (const dim of report.dimensions) {
      dim.anchors = dim.anchors.filter(a => transcript.turns.some(t => t.turn_id === a));
      if (dim.anchors.length === 0 && dim.score !== 3) {
        dim.anchors = decisionAnchor;
      }
    }
  }

  return report;
}

function scoreOpenQuestions(traineeTurns: Transcript['turns'], _travelerTurns: Transcript['turns']): FeedbackDimension {
  if (traineeTurns.length === 0) {
    return { dimension_id: 'open-questions', score: 1, rationale: 'No trainee turns to evaluate.', anchors: [] };
  }

  const openPatterns = [
    /^how\b/i, /^what\b/i, /^where\b/i, /^tell me\b/i, /^describe\b/i,
    /can you tell (me|us)/i, /would you/i, /mind (sharing|telling)/i,
    /how was/i, /what brought/i, /where are you/i,
  ];
  const accusatoryPatterns = [
    /really\?/i, /are you sure/i, /tell me the truth/i,
    /is that (right|true)/i, /come on/i, /i don't believe/i,
    /you (sure|can tell me|need to tell)/i,
  ];

  let openCount = 0;
  let accusatoryCount = 0;
  const openAnchors: string[] = [];
  const accusatoryAnchors: string[] = [];

  for (const turn of traineeTurns) {
    const text = turn.text;
    const isOpen = openPatterns.some(p => p.test(text));
    const isAccusatory = accusatoryPatterns.some(p => p.test(text));

    if (isOpen) {
      openCount++;
      openAnchors.push(turn.turn_id);
    }
    if (isAccusatory) {
      accusatoryCount++;
      accusatoryAnchors.push(turn.turn_id);
    }
  }

  const ratio = traineeTurns.length > 0 ? openCount / traineeTurns.length : 0;

  let score: number;
  let rationale: string;

  if (ratio >= 0.6 && accusatoryCount === 0) {
    score = 5;
    rationale = 'Excellent use of open questions. No leading or accusatory prompts.';
  } else if (ratio >= 0.4 && accusatoryCount <= 1) {
    score = 4;
    rationale = 'Good use of open questions with minimal leading prompts.';
  } else if (ratio >= 0.3 || (accusatoryCount <= 2 && openCount >= 1)) {
    score = 3;
    rationale = 'Adequate mix of open and closed questions. Some room for improvement.';
  } else if (accusatoryCount <= 3) {
    score = 2;
    rationale = 'Too many leading or closed questions. Few open prompts.';
  } else {
    score = 1;
    rationale = 'Predominantly accusatory or leading questions. No effective open prompts.';
  }

  const anchors = openAnchors.length > 0 ? openAnchors : (accusatoryAnchors.length > 0 ? accusatoryAnchors : [traineeTurns[0].turn_id]);

  return {
    dimension_id: 'open-questions',
    score,
    rationale,
    anchors,
  };
}

function scoreTraumaInformedLanguage(traineeTurns: Transcript['turns'], _travelerTurns: Transcript['turns']): FeedbackDimension {
  if (traineeTurns.length === 0) {
    return { dimension_id: 'trauma-informed-language', score: 1, rationale: 'No trainee turns to evaluate.', anchors: [] };
  }

  const traumaViolations = [
    /tell me the truth/i, /you're lying/i, /i don't believe you/i,
    /you can tell me/i, /come on/i, /i've heard that before/i,
    /you need to (tell|cooperate)/i, /i'm watching you/i,
    /you're (being )?trafficked/i,
  ];
  const traumaPositive = [
    /no problem/i, /that's okay/i, /i understand/i,
    /take your time/i, /it's (okay|fine|alright)/i,
    /welcome/i, /lovely/i, /nice/i,
  ];

  let violations = 0;
  let positives = 0;
  const violationAnchors: string[] = [];
  const positiveAnchors: string[] = [];

  for (const turn of traineeTurns) {
    const text = turn.text;
    if (traumaViolations.some(p => p.test(text))) {
      violations++;
      violationAnchors.push(turn.turn_id);
    }
    if (traumaPositive.some(p => p.test(text))) {
      positives++;
      positiveAnchors.push(turn.turn_id);
    }
  }

  let score: number;
  let rationale: string;

  if (violations === 0 && positives >= 2) {
    score = 5;
    rationale = 'Exemplary trauma-informed language. Warm, patient, and non-accusatory throughout.';
  } else if (violations === 0 && positives >= 1) {
    score = 4;
    rationale = 'Good trauma-informed approach. Some warmth, no violations.';
  } else if (violations <= 1) {
    score = 3;
    rationale = 'Adequate. Neutral tone with minor room for improvement.';
  } else if (violations <= 3) {
    score = 2;
    rationale = 'Several instances of pressuring or accusatory language.';
  } else {
    score = 1;
    rationale = 'Persistent accusatory or pressuring tone. Not trauma-informed.';
  }

  const anchors = violationAnchors.length > 0 ? violationAnchors : (positiveAnchors.length > 0 ? positiveAnchors : [traineeTurns[0].turn_id]);

  return {
    dimension_id: 'trauma-informed-language',
    score,
    rationale,
    anchors,
  };
}

function scoreIndicatorRecognition(traineeTurns: Transcript['turns'], _travelerTurns: Transcript['turns'], card: ScenarioCard): FeedbackDimension {
  if (traineeTurns.length === 0) {
    return { dimension_id: 'indicator-recognition', score: 1, rationale: 'No trainee turns to evaluate.', anchors: [] };
  }

  const indicatorsPresent = card.ground_truth.indicators_present;
  const isInnocent = card.ground_truth.type === 'innocent';

  // Simple heuristic: did the trainee ask about itinerary, travel details, or relationships?
  const explorationPatterns = [
    /where (are you|headed|going|flying)/i,
    /who (are you|is that|is|with)/i,
    /how long/i,
    /what (brings|brought)/i,
    /tell me about/i,
    /picking you up/i,
    /visiting/i,
    /family/i,
  ];

  let explorationCount = 0;
  const explorationAnchors: string[] = [];

  for (const turn of traineeTurns) {
    if (explorationPatterns.some(p => p.test(turn.text))) {
      explorationCount++;
      explorationAnchors.push(turn.turn_id);
    }
  }

  let score: number;
  let rationale: string;

  if (isInnocent) {
    if (explorationCount >= 3) {
      score = 5;
      rationale = 'Thorough exploration of traveler details. Correctly identified all signals as benign.';
    } else if (explorationCount >= 2) {
      score = 4;
      rationale = 'Good exploration. Most signals correctly interpreted.';
    } else if (explorationCount >= 1) {
      score = 3;
      rationale = 'Some exploration of traveler details, but could be more thorough.';
    } else {
      score = 2;
      rationale = 'Minimal exploration of traveler details. Risk of missing context.';
    }
  } else {
    // Trafficking scenario
    if (indicatorsPresent.length > 0 && explorationCount >= 3) {
      score = 5;
      rationale = 'Excellent indicator recognition. Identified behavioral cluster correctly.';
    } else if (explorationCount >= 2) {
      score = 4;
      rationale = 'Good awareness of potential indicators. Some exploration of traveler details.';
    } else if (explorationCount >= 1) {
      score = 3;
      rationale = 'Some awareness but missed opportunities to explore indicators.';
    } else {
      score = 1;
      rationale = 'Failed to explore any indicators. Trafficking scenario not identified.';
    }
  }

  return {
    dimension_id: 'indicator-recognition',
    score,
    rationale,
    anchors: explorationAnchors.length > 0 ? explorationAnchors : [traineeTurns[0].turn_id],
  };
}

function scoreFalsePositiveDiscipline(transcript: Transcript, card: ScenarioCard): FeedbackDimension {
  const isInnocent = card.ground_truth.type === 'innocent';
  const traineeDecision = transcript.decision.value;

  if (!isInnocent) {
    return {
      dimension_id: 'false-positive-discipline',
      score: 3,
      rationale: 'Not applicable for trafficking scenario. Neutral score.',
      anchors: [],
    };
  }

  if (traineeDecision === 'no_action') {
    return {
      dimension_id: 'false-positive-discipline',
      score: 4,
      rationale: 'Correctly avoided a false positive. Decision was appropriate.',
      anchors: [],
    };
  }

  return {
    dimension_id: 'false-positive-discipline',
    score: 1,
    rationale: 'False positive: referred an innocent scenario. Escalated without sufficient behavioral basis.',
    anchors: [],
  };
}

function scoreReferralProtocol(transcript: Transcript, card: ScenarioCard): FeedbackDimension {
  const traineeDecision = transcript.decision.value;
  const isTrafficking = card.ground_truth.type === 'trafficking';

  if (traineeDecision === 'no_action' && !isTrafficking) {
    return {
      dimension_id: 'referral-protocol',
      score: 3,
      rationale: 'No referral needed. Nothing exercised the referral pathway.',
      anchors: [],
    };
  }

  if (traineeDecision === 'refer' && isTrafficking) {
    return {
      dimension_id: 'referral-protocol',
      score: 4,
      rationale: 'Correct referral decision. Appropriate protocol followed.',
      anchors: [],
    };
  }

  if (traineeDecision === 'no_action' && isTrafficking) {
    return {
      dimension_id: 'referral-protocol',
      score: 1,
      rationale: 'Failed to refer a trafficking scenario. Critical miss.',
      anchors: [],
    };
  }

  // False positive
  return {
    dimension_id: 'referral-protocol',
    score: 2,
    rationale: 'Referred without sufficient behavioral basis.',
    anchors: [],
  };
}

function generateSummary(dimensions: FeedbackDimension[], decisionOutcome: DecisionOutcome): string {
  const avgScore = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
  const outcome = decisionOutcome.appropriate ? 'correct' : 'incorrect';

  if (avgScore >= 4) {
    return `Strong session with ${outcome} decision. Average score ${avgScore.toFixed(1)}/5. Focus areas: ${dimensions.filter(d => d.score <= 3).map(d => d.dimension_id).join(', ') || 'none — maintain current technique.'}`;
  } else if (avgScore >= 3) {
    return `Adequate session with ${outcome} decision. Average score ${avgScore.toFixed(1)}/5. Key improvement areas: ${dimensions.filter(d => d.score <= 2).map(d => d.dimension_id).join(', ') || 'continue building on strengths.'}`;
  } else {
    return `Session needs improvement. ${outcome.charAt(0).toUpperCase() + outcome.slice(1)} decision with average score ${avgScore.toFixed(1)}/5. Priority areas: ${dimensions.filter(d => d.score <= 2).map(d => d.dimension_id).join(', ')}.`;
  }
}