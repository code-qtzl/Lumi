import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import * as fs from 'fs';
import * as path from 'path';
import scenariosRouter from './routes/scenarios';
import { sessionsRouter } from './routes/sessions';
import { tracesRouter } from './routes/traces';
import { feedbackRouter } from './routes/feedback';
import { historyRouter } from './routes/history';
import { loadScenarioCards } from './scenarios/registry';
import { identify, requireOwnedSession } from './identity';

const app = express();

// Behind a hosting proxy (Fly, Railway) req.ip is the proxy's address unless
// we trust it — every visitor would share one rate-limit bucket. Set
// TRUST_PROXY to the number of proxy hops (1 on Fly/Railway).
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

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

// Every turn is a model call — cap them per IP so one visitor can't drain
// the shared model quota for everyone. Human typing cadence is far below this.
const turnLimit = rateLimit({
  windowMs: 60 * 1000,
  max: () => Number(process.env.TURN_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are sending questions too quickly. Please wait a moment and try again.' },
  // Tests skip it unless they set a limit explicitly (sessions.test.ts does).
  skip: () => process.env.NODE_ENV === 'test' && !process.env.TURN_RATE_LIMIT_MAX,
});

loadScenarioCards();

// Rate-limit only session creation (each create triggers LLM calls). Must be
// registered BEFORE the router mount — middleware added after a router that
// already answered the request never runs.
const limitSessionCreate = (req: Request, res: Response, next: NextFunction) =>
  req.method === 'POST' && (req.path === '/' || req.path === '')
    ? sessionCreateLimit(req, res, next)
    : next();

// Anonymous per-browser identity (identity.ts): each visitor only sees their
// own sessions and history. No accounts — no sign-up, no PII.
app.use('/api', identify);

app.use('/api/scenarios', scenariosRouter);

// Dev-only: traces contain raw pre-guard model output (i.e. ground-truth
// leaks the guard suppressed) — never expose them to a trainee session.
if (process.env.NODE_ENV !== 'production' || process.env.DEV_TRACES === '1') {
  app.use('/api/traces', tracesRouter);
}

// Ownership guard runs before every per-session route, feedback included.
app.use('/api/sessions/:id', requireOwnedSession);
app.post('/api/sessions/:id/turn', turnLimit);
app.use('/api/sessions/:id/feedback', feedbackRouter);
app.use('/api/sessions', limitSessionCreate, sessionsRouter);
app.use('/api/history', historyRouter);

// Production: serve the built client from the same origin, so the cookie and
// relative /api calls work with no CORS. Unknown non-API paths get the SPA.
const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// Priority 8 — Global error handler: catches unhandled throws and returns
// clean JSON instead of leaking stack traces to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

export default app;
