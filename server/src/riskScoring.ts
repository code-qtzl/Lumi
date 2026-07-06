import {
  RiskAssessment,
  RiskIndicator,
  RiskLevel,
  GuardrailFeedback,
} from './types';

// Risk scoring keywords by category
const RISK_KEYWORDS = {
  travel_control: {
    keywords: [
      'someone else has',
      'not my passport',
      'borrowed',
      'itinerary planned by',
      'told where to go',
      'arranged trip',
      'ticket arranged',
    ],
    indicators: [
      'Traveler lacks control over travel documents',
      'Itinerary planned by someone else',
      'Travel arrangements made by third party',
    ],
  },
  document_control: {
    keywords: [
      'passport held by',
      'someone else holds',
      'not my documents',
      'taken away',
      'gave documents to',
      'visa issues',
    ],
    indicators: [
      'Document control by third party',
      'Unable to produce travel documents',
      'Visa or documentation concerns',
    ],
  },
  coercion: {
    keywords: [
      'threatened',
      'forced',
      'if i',
      'or else',
      'hurt',
      'family',
      'debt',
      'owe',
      'promised',
      'coerced',
      'pressure',
    ],
    indicators: [
      'Potential coercion indicators',
      'Threats or pressure mentioned',
      'Debt bondage concerns',
      'Family-based pressure',
    ],
  },
  inconsistency: {
    keywords: [
      "don't know",
      'not sure',
      'confused about',
      'different story',
      'changed answer',
      'unclear',
      'vague',
    ],
    indicators: [
      'Inconsistency in traveler narrative',
      'Gaps in story or explanation',
      'Confusion about travel details',
    ],
  },
  vulnerable_person: {
    keywords: [
      'child',
      'minor',
      'young',
      'teenager',
      'disabled',
      'pregnant',
      'elderly',
      'alone',
      'unaccompanied',
    ],
    indicators: [
      'Minor or vulnerable person identified',
      'Traveling without proper protection',
      'Special vulnerability factors',
    ],
  },
  urgent_safety: {
    keywords: [
      'immediate threat',
      'danger',
      'emergency',
      'need help now',
      'in danger',
      'safety concern',
      'trafficking',
      'abuse',
    ],
    indicators: [
      'Urgent safety concern identified',
      'Immediate threat to safety',
      'Emergency intervention may be needed',
    ],
  },
};

const HARMFUL_WORDS = [
  'accuse',
  'suspect',
  'liar',
  'criminal',
  'guilty',
  'predator',
  'monster',
  'weirdo',
  'creep',
  'scam',
];

export function analyzeResponse(
  currentMessages: string[],
  newMessage: string
): RiskAssessment {
  const allText = [...currentMessages, newMessage].join(' ').toLowerCase();
  const indicators: RiskIndicator[] = [];
  let baseRiskScore = 0;

  // Scan for each risk category
  for (const [category, data] of Object.entries(RISK_KEYWORDS)) {
    const matches = data.keywords.filter((keyword) =>
      allText.includes(keyword.toLowerCase())
    );

    if (matches.length > 0) {
      const severity =
        matches.length === 1 ? 'low' : matches.length === 2 ? 'medium' : 'high';
      baseRiskScore += matches.length * (severity === 'high' ? 3 : severity === 'medium' ? 2 : 1);

      indicators.push({
        category: category as any,
        severity,
        description: data.indicators[0],
        evidence: matches.join(', '),
      });
    }
  }

  // Determine risk level
  let level: RiskLevel = 'safe';
  let confidence = Math.max(50, Math.min(100, 50 + baseRiskScore * 5));

  if (baseRiskScore >= 8) {
    level = 'unsafe';
  } else if (baseRiskScore >= 4) {
    level = 'risky';
  }

  // Check for urgent situations
  const urgentKeywords = ['immediate threat', 'emergency', 'danger', 'help now'];
  const isUrgent = urgentKeywords.some((kw) =>
    allText.includes(kw.toLowerCase())
  );

  if (isUrgent) {
    level = 'unsafe';
    confidence = 95;
  }

  const recommendedNextSteps = generateNextSteps(
    level,
    indicators,
    allText
  );

  return {
    level,
    confidence,
    indicators,
    summary: generateSummary(level, indicators),
    recommendedNextSteps,
    escalationNeeded: level === 'unsafe' || confidence > 80,
  };
}

function generateSummary(level: RiskLevel, indicators: RiskIndicator[]): string {
  const categoryCount = indicators.length;

  if (level === 'unsafe') {
    return `Critical: Multiple risk indicators detected (${categoryCount} categories). Immediate escalation recommended.`;
  } else if (level === 'risky') {
    return `Moderate risk: ${categoryCount} concerning indicator(s) identified. Further assessment recommended.`;
  } else {
    return 'No significant risk indicators detected at this time.';
  }
}

function generateNextSteps(
  level: RiskLevel,
  indicators: RiskIndicator[],
  context: string
): string[] {
  const steps: string[] = [];

  if (level === 'unsafe') {
    steps.push('🚨 Escalate immediately to supervisory officer');
    steps.push('Ensure traveler safety before continuing interview');
    steps.push('Connect with law enforcement if trafficking suspected');
    steps.push('Document all concerning statements exactly as stated');
  } else if (level === 'risky') {
    steps.push('Continue probing document and travel control');
    steps.push('Ask about travel plans and who arranged them');
    steps.push('Explore decision-making autonomy');
    steps.push('Consider vulnerability factors');
  } else {
    steps.push('Continue routine questioning as appropriate');
    steps.push('Monitor for changes in demeanor or responses');
  }

  // Add specific follow-ups based on indicators
  if (indicators.some((i) => i.category === 'document_control')) {
    steps.push('Verify traveler has physical access to all documents');
  }
  if (indicators.some((i) => i.category === 'coercion')) {
    steps.push('Explore who influenced travel decision');
  }
  if (indicators.some((i) => i.category === 'vulnerable_person')) {
    steps.push('Ensure appropriate support resources offered');
  }

  return steps.slice(0, 4);
}

export function checkGuardrails(question: string): GuardrailFeedback {
  const lowercaseQuestion = question.toLowerCase();
  const hasHarmfulLanguage = HARMFUL_WORDS.some((word) =>
    lowercaseQuestion.includes(word)
  );

  const suggestions: string[] = [];
  let rewrittenQuestion: string | undefined;

  if (hasHarmfulLanguage) {
    suggestions.push(
      'Avoid accusatory language. Reframe as open-ended observation.'
    );
    rewrittenQuestion = makeTraumaInformed(question);
  }

  // Check for complex sentences
  if (question.split(';').length > 2 || question.length > 200) {
    suggestions.push('Consider breaking this into simpler questions.');
  }

  // Check for leading questions
  if (question.includes('did you') || question.includes('didn\'t you')) {
    suggestions.push('This may be a leading question. Try open-ended phrasing.');
  }

  const isUrgent = [
    'immediate threat',
    'emergency',
    'in danger',
  ].some((phrase) => lowercaseQuestion.includes(phrase));

  return {
    hasHarmfulLanguage,
    suggestions,
    rewrittenQuestion,
    isUrgentSituation: isUrgent,
  };
}

function makeTraumaInformed(question: string): string {
  let rewritten = question;

  // Simple replacements for common accusatory patterns
  const replacements: Record<string, string> = {
    'did you lie': 'can you help clarify',
    'why are you suspicious': 'what concerned you',
    'you seem guilty': 'how are you feeling right now',
    'that\'s a scam': 'can you walk me through what happened',
  };

  for (const [accusatory, supportive] of Object.entries(replacements)) {
    rewritten = rewritten.replace(
      new RegExp(accusatory, 'gi'),
      supportive
    );
  }

  return rewritten;
}
