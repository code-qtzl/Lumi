export type RiskLevel = 'safe' | 'risky' | 'unsafe';

export type DisplayRiskLevel = 'low' | 'elevated' | 'high' | 'critical';

export type Speaker = 'officer' | 'traveler';

export interface RiskIndicator {
	category:
		| 'travel_control'
		| 'document_control'
		| 'coercion'
		| 'inconsistency'
		| 'vulnerable_person'
		| 'urgent_safety';
	severity: 'low' | 'medium' | 'high';
	description: string;
	evidence: string;
}

export interface RiskAssessment {
	level: RiskLevel;
	displayLevel?: DisplayRiskLevel;
	confidence: number;
	indicators: RiskIndicator[];
	summary: string;
	recommendedNextSteps: string[];
	escalationNeeded: boolean;
	toneSignals?: ToneSignalSummary;
}

export interface InterviewMessage {
	id: string;
	role: 'officer' | 'assistant';
	speaker?: Speaker;
	source?: 'text' | 'voice';
	content: string;
	timestamp: Date;
	riskAssessment?: RiskAssessment;
}

export interface ToneSignalSummary {
	whisperLikelihood: number;
	voiceInstability: number;
	longPauseFrequency: number;
	speechRateWps: number;
	lowVolumeScore: number;
	abnormalFeatures: string[];
	raisedConcern: boolean;
	explanation: string[];
}

export interface ToneBaseline {
	speechRateWps: number;
	longPauseFrequency: number;
	lowVolumeScore: number;
	capturedAt: Date;
	reasonTag: string;
}

export interface ToneState {
	baseline?: ToneBaseline;
	consecutiveNormalTravelerUtterances: number;
	toneRaisedConcernActive: boolean;
}

export interface RiskOverrideAuditEntry {
	id: string;
	messageId: string;
	previousLevel: RiskLevel;
	nextLevel: RiskLevel;
	justification: string;
	createdBy: string;
	createdAt: Date;
	supervisorAcknowledged: boolean;
}

export interface VoiceAnalysisResult {
	transcriptOriginal: string;
	transcriptForAnalysis: string;
	detectedLanguage: string;
	confidence: number;
	blocked: boolean;
	requiresManualConfirm: boolean;
	blockReason?: string;
	speaker: Speaker;
	toneSignals?: ToneSignalSummary;
	baselineCaptured: boolean;
	baseline?: ToneBaseline;
}

export interface InterviewSession {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	officerName: string;
	messages: InterviewMessage[];
	currentRiskLevel: RiskLevel;
	currentDisplayRiskLevel?: DisplayRiskLevel;
	allIndicators: RiskIndicator[];
	notes: string;
	toneState: ToneState;
	riskOverrideAudit: RiskOverrideAuditEntry[];
}
