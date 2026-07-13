import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import scenariosRouter from './routes/scenarios';
import { sessionsRouter } from './routes/sessions';
import { tracesRouter } from './routes/traces';
import { feedbackRouter } from './routes/feedback';
import { loadScenarioCards } from './scenarios/registry';

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

// Rate-limit only session creation (each create triggers LLM calls). Must be
// registered BEFORE the router mount — middleware added after a router that
// already answered the request never runs.
const limitSessionCreate = (req: Request, res: Response, next: NextFunction) =>
  req.method === 'POST' && (req.path === '/' || req.path === '')
    ? sessionCreateLimit(req, res, next)
    : next();

// Routes. No auth in v1 by design (PRD out-of-scope #4: single local user;
// accounts arrive with dashboards/multi-user). Trainee-safe views + the
// session-scoped reveal are what protect hidden state, not identity.
app.use('/api/scenarios', scenariosRouter);

// Dev-only: traces contain raw pre-guard model output (i.e. ground-truth
// leaks the guard suppressed) — never expose them to a trainee session.
if (process.env.NODE_ENV !== 'production' || process.env.DEV_TRACES === '1') {
  app.use('/api/traces', tracesRouter);
}

app.use('/api/sessions/:id/feedback', feedbackRouter);
app.use('/api/sessions', limitSessionCreate, sessionsRouter);

// Priority 8 — Global error handler: catches unhandled throws and returns
// clean JSON instead of leaking stack traces to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

export default app;
