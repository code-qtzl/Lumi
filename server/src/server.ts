import express from 'express';
import cors from 'cors';
import {
  InterviewSession,
  InterviewMessage,
  RiskAssessment,
} from './types';
import { analyzeResponse, checkGuardrails } from './riskScoring';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// In-memory storage
const sessions = new Map<string, InterviewSession>();

// Generate a simple UUID-like ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
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
    allIndicators: [],
    notes: '',
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
  const { content } = req.body;
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
    timestamp: new Date(),
  };

  session.messages.push(userMessage);

  // Analyze the message for risk
  const allContent = session.messages.map((m) => m.content);
  const riskAssessment = analyzeResponse(allContent.slice(0, -1), content);

  // Update session risk level
  if (riskAssessment.level === 'unsafe') {
    session.currentRiskLevel = 'unsafe';
  } else if (
    riskAssessment.level === 'risky' &&
    session.currentRiskLevel !== 'unsafe'
  ) {
    session.currentRiskLevel = 'risky';
  }

  // Add new indicators
  for (const indicator of riskAssessment.indicators) {
    if (
      !session.allIndicators.some(
        (i) =>
          i.category === indicator.category &&
          i.evidence === indicator.evidence
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
      allIndicators: session.allIndicators,
    },
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
