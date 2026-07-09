/**
 * Beacon app server — session runtime entry point.
 *
 * Endpoints:
 *   GET  /api/scenarios          — list available scenarios
 *   POST /api/sessions           — create a new session
 *   POST /api/sessions/:id/turn  — submit a trainee turn
 *   POST /api/sessions/:id/end   — end session with decision
 *   GET  /api/sessions/:id       — get session transcript
 *   GET  /api/traces             — dev trace page
 */

import express from 'express';
import cors from 'cors';
import { createSession, submitTurn, endSession, getTranscript } from './session/engine';
import { getScenarioCard, listScenarios, loadScenarioCards } from './scenarios/registry';
import { getTraceBuffer, getSessionTraces } from './tracing/tracer';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Load scenario cards on startup
loadScenarioCards();

// ─── Routes ────────────────────────────────────────────────────────────

/** GET /api/scenarios — list available scenarios */
app.get('/api/scenarios', (_req, res) => {
  res.json({ scenarios: listScenarios() });
});

/** POST /api/sessions — create a new session */
app.post('/api/sessions', (req, res) => {
  const { scenario_id, mode } = req.body;

  if (!scenario_id) {
    return res.status(400).json({ error: 'scenario_id is required' });
  }

  const card = getScenarioCard(scenario_id);
  if (!card) {
    return res.status(404).json({ error: `Scenario '${scenario_id}' not found` });
  }

  const session = createSession(card, mode || 'text');
  return res.status(201).json(session);
});

/** POST /api/sessions/:id/turn — submit a trainee turn */
app.post('/api/sessions/:id/turn', (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required and must be non-empty' });
  }

  const result = submitTurn(req.params.id, text);
  if ('error' in result) {
    return res.status(404).json(result);
  }

  return res.json(result);
});

/** POST /api/sessions/:id/end — end session with a decision */
app.post('/api/sessions/:id/end', (req, res) => {
  const { decision, stated_reason } = req.body;

  if (!decision || !['refer', 'no_action'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "refer" or "no_action"' });
  }

  const result = endSession(req.params.id, decision, stated_reason);
  if ('error' in result) {
    return res.status(404).json(result);
  }

  return res.json(result);
});

/** GET /api/sessions/:id — get session transcript */
app.get('/api/sessions/:id', (req, res) => {
  const result = getTranscript(req.params.id);
  if ('error' in result) {
    return res.status(404).json(result);
  }
  return res.json({ transcript: result });
});

/** GET /api/traces — dev trace page */
app.get('/api/traces', (req, res) => {
  const { session_id } = req.query;
  const traces = session_id
    ? getSessionTraces(session_id as string)
    : getTraceBuffer();
  return res.json({ traces, count: traces.length });
});

/** GET /api/traces/:session_id — traces for a specific session */
app.get('/api/traces/:session_id', (req, res) => {
  const traces = getSessionTraces(req.params.session_id);
  return res.json({ traces, count: traces.length });
});

// ─── Start ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Session runtime running on http://localhost:${PORT}`);
  console.log(`[server] Scenarios: ${listScenarios().length} loaded`);
});