// Risk scoring domain types

export type RiskLevel = 'safe' | 'risky' | 'unsafe';

export interface RiskIndicator {
  category: 'travel_control' | 'document_control' | 'coercion' | 'inconsistency' | 'vulnerable_person' | 'urgent_safety';
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidence: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  confidence: number; // 0-100
  indicators: RiskIndicator[];
  summary: string;
  recommendedNextSteps: string[];
  escalationNeeded: boolean;
}

export interface InterviewMessage {
  id: string;
  role: 'officer' | 'assistant';
  content: string;
  timestamp: Date;
  riskAssessment?: RiskAssessment;
}

export interface InterviewSession {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  officerName: string;
  messages: InterviewMessage[];
  currentRiskLevel: RiskLevel;
  allIndicators: RiskIndicator[];
  notes: string;
}

export interface GuardrailFeedback {
  hasHarmfulLanguage: boolean;
  suggestions: string[];
  rewrittenQuestion?: string;
  isUrgentSituation: boolean;
}
