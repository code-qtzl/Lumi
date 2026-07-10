/**
 * Session routes — the trainee-facing session runtime API.
 *
 *   POST /api/sessions           — create a new session
 *   POST /api/sessions/:id/turn  — submit a trainee turn
 *   POST /api/sessions/:id/end   — end session with decision (the only way out)
 *   GET  /api/sessions/:id       — transcript when ended, session view while active
 */

import { Router } from 'express';
import { createSession, submitTurn, endSession, getTranscript, getSessionView } from '../session/engine';
import { getScenarioCard } from '../scenarios/registry';

export const sessionsRouter = Router();

/** Engine errors are 'Session not found' or a state conflict (cap / already completed). */
function errorStatus(error: string): number {
  return error === 'Session not found' ? 404 : 409;
}

sessionsRouter.post('/', (req, res) => {
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

sessionsRouter.post('/:id/turn', (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required and must be non-empty' });
  }

  const result = submitTurn(req.params.id, text);
  if ('error' in result) {
    return res.status(errorStatus(result.error)).json(result);
  }

  return res.json(result);
});

sessionsRouter.post('/:id/end', (req, res) => {
  const { decision, stated_reason } = req.body;

  if (!decision || !['refer', 'no_action'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "refer" or "no_action"' });
  }

  const result = endSession(req.params.id, decision, stated_reason);
  if ('error' in result) {
    return res.status(errorStatus(result.error)).json(result);
  }

  return res.json(result);
});

sessionsRouter.get('/:id', (req, res) => {
  const view = getSessionView(req.params.id);
  if ('error' in view) {
    return res.status(404).json(view);
  }

  if (view.status === 'completed') {
    const transcript = getTranscript(req.params.id);
    if (!('error' in transcript)) {
      return res.json({ transcript });
    }
  }

  return res.json({ session: view });
});
