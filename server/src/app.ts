import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import scenariosRouter from './routes/scenarios';
import { sessionsRouter } from './routes/sessions';
import { tracesRouter } from './routes/traces';
import { feedbackRouter } from './routes/feedback';
import { authRouter } from './routes/auth';
import { requireAuth } from './middleware/auth';
import { loadScenarioCards } from './scenarios/registry';

interface Message {
	id: number;
	name: string;
	message: string;
	timestamp: Date;
}

const app = express();

// Priority 4 — CORS lockdown: reads ALLOWED_ORIGIN; open in dev when unset.
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));
app.use(express.json());

// Priority 5 — Rate limit session creation to prevent LLM flooding.
const sessionCreateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sessions created. Please wait a minute and try again.' },
  skip: () => process.env.NODE_ENV === 'test',
});

loadScenarioCards();

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/traces', tracesRouter);

// Protected routes (JWT when JWT_SECRET is set; open in dev)
app.use('/api/sessions', requireAuth, sessionsRouter);
app.use('/api/sessions/:id/feedback', requireAuth, feedbackRouter);

// Apply rate limit only to POST /api/sessions (session creation = LLM call)
app.use('/api/sessions', sessionCreateLimit);

let messages: Message[] = [];
let nextId = 1;

app.get('/messages', (req, res) => {
	res.json(messages);
});

app.post('/messages', (req, res) => {
	const { name, message } = req.body;

	if (!name || !message) {
		return res.status(400).json({ error: 'Name and message are required' });
	}

	const newMessage: Message = {
		id: nextId++,
		name,
		message,
		timestamp: new Date(),
	};

	messages.push(newMessage);
	res.status(201).json(newMessage);
});

// Priority 8 — Global error handler: catches unhandled throws and returns
// clean JSON instead of leaking stack traces to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

export default app;
