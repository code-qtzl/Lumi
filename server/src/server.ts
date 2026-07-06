import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import {
	InterviewSession,
	InterviewMessage,
	RiskAssessment,
	RiskLevel,
	Speaker,
	ToneSignalSummary,
} from './types';
import {
	analyzeResponse,
	checkGuardrails,
	mapDisplayRiskLevel,
} from './riskScoring';
import { analyzeVoiceUtterance } from './voiceProcessing';

const app = express();
const PORT = 3000;
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024,
	},
});
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json());

// In-memory storage
const sessions = new Map<string, InterviewSession>();

// Generate a simple UUID-like ID
function generateId(): string {
	return (
		Math.random().toString(36).substring(2, 15) +
		Math.random().toString(36).substring(2, 15)
	);
}

function toDate(value: Date | string): Date {
	return value instanceof Date ? value : new Date(value);
}

function mapLevelToLabel(level: RiskLevel): string {
	if (level === 'unsafe') {
		return 'Critical';
	}
	if (level === 'risky') {
		return 'Elevated';
	}
	return 'Low';
}

function applyTonePolicy(
	riskAssessment: RiskAssessment,
	toneSignals: ToneSignalSummary | undefined,
	speaker: Speaker,
	session: InterviewSession,
): RiskAssessment {
	if (!toneSignals || speaker !== 'traveler') {
		session.toneState.consecutiveNormalTravelerUtterances +=
			speaker === 'traveler' ? 1 : 0;

		if (session.toneState.consecutiveNormalTravelerUtterances >= 3) {
			session.toneState.toneRaisedConcernActive = false;
		}

		return {
			...riskAssessment,
			displayLevel: mapDisplayRiskLevel(
				riskAssessment.level,
				riskAssessment.confidence,
			),
		};
	}

	const adjusted = { ...riskAssessment, toneSignals };

	if (toneSignals.raisedConcern) {
		session.toneState.toneRaisedConcernActive = true;
		session.toneState.consecutiveNormalTravelerUtterances = 0;

		// Tone can raise to Elevated at most when content does not indicate higher concern.
		if (adjusted.level === 'safe') {
			adjusted.level = 'risky';
			adjusted.confidence = Math.min(
				78,
				Math.max(adjusted.confidence, 70),
			);
			adjusted.summary =
				'Tone signals indicate elevated concern. Continue trauma-informed private follow-up while gathering content-based indicators.';
			adjusted.recommendedNextSteps = [
				'Continue with private, non-leading questions',
				'Check whether the traveler can communicate freely',
				'Re-assess on the next traveler response before escalating',
				'Document tone observations objectively',
			];
			adjusted.escalationNeeded = false;
		} else {
			adjusted.confidence = Math.min(100, adjusted.confidence + 5);
		}
	} else {
		session.toneState.consecutiveNormalTravelerUtterances += 1;
		if (session.toneState.consecutiveNormalTravelerUtterances >= 3) {
			session.toneState.toneRaisedConcernActive = false;
		}
	}

	adjusted.displayLevel = mapDisplayRiskLevel(
		adjusted.level,
		adjusted.confidence,
	);
	return adjusted;
}

// POST /sessions - Create a new interview session
app.post('/sessions', (req, res) => {
	const { officerName } = req.body;

	if (!officerName?.trim()) {
		return res.status(400).json({ error: 'Officer name is required' });
	}

	const sessionId = generateId();
	const session: InterviewSession = {
		id: sessionId,
		createdAt: new Date(),
		updatedAt: new Date(),
		officerName,
		messages: [],
		currentRiskLevel: 'safe',
		currentDisplayRiskLevel: 'low',
		allIndicators: [],
		notes: '',
		toneState: {
			consecutiveNormalTravelerUtterances: 0,
			toneRaisedConcernActive: false,
		},
		riskOverrideAudit: [],
	};

	sessions.set(sessionId, session);
	res.status(201).json(session);
});

// GET /sessions/:id - Get a specific session
app.get('/sessions/:id', (req, res) => {
	const session = sessions.get(req.params.id);

	if (!session) {
		return res.status(404).json({ error: 'Session not found' });
	}

	res.json(session);
});

// POST /sessions/:id/messages - Add a message to a session
app.post('/sessions/:id/messages', (req, res) => {
	const {
		content,
		speaker = 'officer',
		source = 'text',
		toneSignals,
	}: {
		content?: string;
		speaker?: Speaker;
		source?: 'text' | 'voice';
		toneSignals?: ToneSignalSummary;
	} = req.body;
	const session = sessions.get(req.params.id);

	if (!session) {
		return res.status(404).json({ error: 'Session not found' });
	}

	if (!content?.trim()) {
		return res.status(400).json({ error: 'Message content is required' });
	}

	const messageId = generateId();
	const userMessage: InterviewMessage = {
		id: messageId,
		role: 'officer',
		content,
		speaker,
		source,
		timestamp: new Date(),
	};

	session.messages.push(userMessage);

	// Analyze the message for risk
	const allContent = session.messages.map((m) => m.content);
	const baseRiskAssessment = analyzeResponse(
		allContent.slice(0, -1),
		content,
	);
	const riskAssessment = applyTonePolicy(
		baseRiskAssessment,
		toneSignals,
		speaker,
		session,
	);

	// Update session risk level
	if (riskAssessment.level === 'unsafe') {
		session.currentRiskLevel = 'unsafe';
	} else if (
		riskAssessment.level === 'risky' &&
		session.currentRiskLevel !== 'unsafe'
	) {
		session.currentRiskLevel = 'risky';
	}

	session.currentDisplayRiskLevel = mapDisplayRiskLevel(
		session.currentRiskLevel,
		riskAssessment.confidence,
	);

	// Add new indicators
	for (const indicator of riskAssessment.indicators) {
		if (
			!session.allIndicators.some(
				(i) =>
					i.category === indicator.category &&
					i.evidence === indicator.evidence,
			)
		) {
			session.allIndicators.push(indicator);
		}
	}

	userMessage.riskAssessment = riskAssessment;
	session.updatedAt = new Date();

	// Generate AI assistant response
	const assistantMessage: InterviewMessage = {
		id: generateId(),
		role: 'assistant',
		content: generateAssistantResponse(riskAssessment),
		timestamp: new Date(),
	};

	session.messages.push(assistantMessage);

	res.status(201).json({
		message: userMessage,
		riskAssessment,
		assistantMessage,
		sessionUpdated: {
			currentRiskLevel: session.currentRiskLevel,
			currentDisplayRiskLevel: session.currentDisplayRiskLevel,
			allIndicators: session.allIndicators,
		},
	});
});

// POST /sessions/:id/voice/analyze - Transcribe and score tone for one utterance
app.post(
	'/sessions/:id/voice/analyze',
	upload.single('audio'),
	async (req, res) => {
		const session = sessions.get(req.params.id);
		if (!session) {
			return res.status(404).json({ error: 'Session not found' });
		}

		if (!req.file || !req.file.buffer?.length) {
			return res.status(400).json({ error: 'Audio file is required' });
		}

		const speaker = (req.body.speaker as Speaker | undefined) ?? 'traveler';
		const isBaselineCapture = req.body.isBaselineCapture === 'true';
		const reasonTag = (req.body.reasonTag as string | undefined)?.trim();

		if (
			!isBaselineCapture &&
			speaker === 'traveler' &&
			!session.toneState.baseline
		) {
			return res.status(412).json({
				code: 'BASELINE_REQUIRED',
				error: 'Traveler baseline is required before tone scoring.',
			});
		}

		if (isBaselineCapture && !reasonTag) {
			return res
				.status(400)
				.json({ error: 'Baseline reasonTag is required' });
		}

		const apiKey = process.env.DEEPGRAM_API_KEY;
		const allowMockMode =
			process.env.BEACON_VOICE_MOCK_MODE === 'true' ||
			(!apiKey && process.env.NODE_ENV !== 'production');

		try {
			const voiceResult = await analyzeVoiceUtterance(
				{
					audioBuffer: req.file.buffer,
					mimeType: req.file.mimetype || 'audio/webm',
					speaker,
					isBaselineCapture,
					reasonTag,
					baseline: session.toneState.baseline,
				},
				{
					deepgramApiKey: apiKey,
					allowMockMode,
				},
			);

			if (voiceResult.baseline) {
				session.toneState.baseline = voiceResult.baseline;
				session.updatedAt = new Date();
			}

			return res.json(voiceResult);
		} catch (error) {
			console.error('Voice analysis failed:', error);
			return res.status(503).json({
				code: 'VOICE_UNAVAILABLE',
				error: 'Voice service unavailable. Switch to manual text entry to continue the interview.',
			});
		}
	},
);

// POST /sessions/:id/risk-override - Officer risk override with audit trail
app.post('/sessions/:id/risk-override', (req, res) => {
	const session = sessions.get(req.params.id);
	if (!session) {
		return res.status(404).json({ error: 'Session not found' });
	}

	const {
		messageId,
		nextLevel,
		justification,
		supervisorAcknowledged = false,
	}: {
		messageId?: string;
		nextLevel?: RiskLevel;
		justification?: string;
		supervisorAcknowledged?: boolean;
	} = req.body;

	if (!messageId || !nextLevel || !justification?.trim()) {
		return res.status(400).json({
			error: 'messageId, nextLevel, and justification are required',
		});
	}

	const message = session.messages.find((m) => m.id === messageId);
	if (!message?.riskAssessment) {
		return res
			.status(404)
			.json({ error: 'Target message with risk assessment not found' });
	}

	const previousLevel = message.riskAssessment.level;
	const criticalImpactOverride =
		previousLevel === 'unsafe' || nextLevel === 'unsafe';

	if (criticalImpactOverride && !supervisorAcknowledged) {
		return res.status(400).json({
			error: 'Supervisor acknowledgment is required for overrides to or from Critical risk.',
		});
	}

	message.riskAssessment.level = nextLevel;
	message.riskAssessment.displayLevel = mapDisplayRiskLevel(
		nextLevel,
		message.riskAssessment.confidence,
	);
	message.riskAssessment.summary = `Officer override applied: ${mapLevelToLabel(
		previousLevel,
	)} -> ${mapLevelToLabel(nextLevel)}. Justification recorded.`;

	session.currentRiskLevel = nextLevel;
	session.currentDisplayRiskLevel = mapDisplayRiskLevel(
		session.currentRiskLevel,
		message.riskAssessment.confidence,
	);
	session.updatedAt = new Date();

	session.riskOverrideAudit.push({
		id: generateId(),
		messageId,
		previousLevel,
		nextLevel,
		justification: justification.trim(),
		createdBy: session.officerName,
		createdAt: new Date(),
		supervisorAcknowledged,
	});

	return res.json({
		message,
		currentRiskLevel: session.currentRiskLevel,
		currentDisplayRiskLevel: session.currentDisplayRiskLevel,
		riskOverrideAudit: session.riskOverrideAudit,
	});
});

// POST /sessions/:id/check-guardrails - Check question for guardrails
app.post('/sessions/:id/check-guardrails', (req, res) => {
	const { question } = req.body;

	if (!question?.trim()) {
		return res.status(400).json({ error: 'Question is required' });
	}

	const feedback = checkGuardrails(question);
	res.json(feedback);
});

// PUT /sessions/:id - Update session notes
app.put('/sessions/:id', (req, res) => {
	const { notes } = req.body;
	const session = sessions.get(req.params.id);

	if (!session) {
		return res.status(404).json({ error: 'Session not found' });
	}

	if (notes !== undefined) {
		session.notes = notes;
	}

	session.updatedAt = new Date();
	res.json(session);
});

// Helper: Generate assistant response based on risk assessment
function generateAssistantResponse(assessment: RiskAssessment): string {
	if (assessment.level === 'unsafe') {
		return `⚠️ URGENT: Multiple critical risk indicators detected. Recommended immediate escalation to supervisory officer. Key concerns: ${assessment.indicators
			.map((i: any) => i.description)
			.join(', ')}. Next steps: ${assessment.recommendedNextSteps[0]}`;
	} else if (assessment.level === 'risky') {
		return `⚠️ Moderate risk detected. Consider probing further on: ${assessment.indicators
			.map((i: any) => i.category.replace('_', ' '))
			.join(', ')}. Suggested: ${assessment.recommendedNextSteps[0]}`;
	} else {
		return `✓ No significant concerns noted. Continue assessment as appropriate.`;
	}
}

setInterval(
	() => {
		const now = Date.now();

		for (const [sessionId, session] of sessions.entries()) {
			const updatedAt = toDate(session.updatedAt).getTime();
			if (now - updatedAt > THIRTY_DAYS_MS) {
				sessions.delete(sessionId);
			}
		}
	},
	60 * 60 * 1000,
);

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
