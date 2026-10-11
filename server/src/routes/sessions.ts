/**
 * Session routes — the trainee-facing session runtime API.
 *
 *   POST /api/sessions                  — create a new session
 *   POST /api/sessions/:id/turn         — submit a trainee turn
 *   POST /api/sessions/:id/end          — end session with decision (the only way out)
 *   GET  /api/sessions/:id/transcript   — fetch the transcript of a completed session
 *   GET  /api/sessions/:id              — transcript when ended, session view while active
 */

import { Router } from 'express';
import { createSession, submitTurn, endSession, getTranscript, getSessionView } from '../session/engine';
import { getSession } from '../session/store';
import { getScenarioCard, listScenarios } from '../scenarios/registry';

export const sessionsRouter = Router();

/** Engine errors: not-found → 404, model unavailability → 503 (retryable), state conflicts → 409. */
function errorStatus(error: string): number {
  if (error === 'Session not found') return 404;
  if (error.includes('model temporarily unavailable')) return 503;
  return 409;
}

sessionsRouter.post('/', async (req, res) => {
  // req.body is undefined without a JSON Content-Type; a throw in an async
  // Express 4 handler is an unhandled rejection that kills the process.
  const { scenario_id, mode } = req.body ?? {};

  if (mode !== undefined && !['text', 'voice'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "text" or "voice"' });
  }

  // The trainee never picks or sees the scenario (U1: "a traveler whose
  // situation I don't know") — omitting scenario_id assigns one at random.
  // Passing an explicit id is for dev/tests/probes/authoring previews.
  let card;
  const explicit = typeof scenario_id === 'string' && scenario_id.length > 0;
  if (explicit) {
    card = getScenarioCard(scenario_id);
    if (!card) {
      return res.status(404).json({ error: `Scenario '${scenario_id}' not found` });
    }
  } else {
    const available = listScenarios();
    if (available.length === 0) {
      return res.status(503).json({ error: 'No scenarios available' });
    }
    const pick = available[Math.floor(Math.random() * available.length)];
    card = getScenarioCard(pick.scenario_id)!;
  }

  let session;
  try {
    session = await createSession(card, mode || 'text', req.traineeId);
  } catch {
    return res.status(503).json({ error: 'Could not start the session — the traveler model is temporarily unavailable. Please try again.' });
  }
  // Hide which scenario was assigned: the id/title alone can reveal the
  // archetype ("coached-companion"). Echo it only when explicitly requested.
  const { scenario_id: assigned, ...hidden } = session;
  return res.status(201).json(explicit ? session : hidden);
});

sessionsRouter.post('/:id/turn', async (req, res) => {
  const { text } = req.body ?? {};

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required and must be non-empty' });
  }

  const result = await submitTurn(req.params.id, text);
  if ('error' in result) {
    return res.status(errorStatus(result.error)).json(result);
  }

  return res.json(result);
});

sessionsRouter.post('/:id/end', (req, res) => {
  const { decision, stated_reason } = req.body ?? {};

  if (!decision || !['refer', 'no_action'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "refer" or "no_action"' });
  }
  // stated_reason lands in the transcript contract — must be a string there
  if (stated_reason !== undefined && typeof stated_reason !== 'string') {
    return res.status(400).json({ error: 'stated_reason must be a string' });
  }

  const result = endSession(req.params.id, decision, stated_reason);
  if ('error' in result) {
    return res.status(errorStatus(result.error)).json(result);
  }

  return res.json(result);
});

/**
 * GET /api/sessions/:id/transcript
 * Returns the transcript of a completed session.
 * 404 if the session does not exist.
 * 409 if the session is still active — a transcript only exists after a decision is committed.
 */
sessionsRouter.get('/:id/transcript', (req, res) => {
  const transcript = getTranscript(req.params.id);

  if ('error' in transcript) {
    const isNotFound = transcript.error === 'Session not found';
    return res.status(isNotFound ? 404 : 409).json({ error: transcript.error });
  }

  return res.json({ transcript });
});

/**
 * GET /api/sessions/:id/reveal
 * The full scenario card (ground truth, reveal, teaching points) for the
 * debrief — ONLY once the session has ended via a decision. This is the sole
 * reveal endpoint: hidden state stays hidden while any session could still
 * be played against the card (U1/F1; vision: scenario reveal is debrief-only).
 */
sessionsRouter.get('/:id/reveal', (req, res) => {
  const state = getSession(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (state.status !== 'completed') {
    return res.status(409).json({ error: 'Session not ended — the reveal is only available after a decision is committed' });
  }
  return res.json(state.scenario_card);
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

  // Mid-session the scenario identity stays hidden (see POST /).
  const { scenario_id: hidden, ...safeView } = view;
  return res.json({ session: safeView });
});
