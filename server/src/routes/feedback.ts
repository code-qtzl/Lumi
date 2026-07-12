/**
 * Feedback routes — score a completed session against the rubric.
 *
 *   POST /api/sessions/:id/feedback  — score the session (idempotent; cached after first run)
 *   GET  /api/sessions/:id/feedback  — retrieve a previously generated report
 */

import { Router } from 'express';
import { getSession } from '../session/store';
import { getReport, setReport } from '../feedback/store';
import { scoreSession } from '../eval/scorer';
import { loadRubric } from '../eval/rubric-loader';

export const feedbackRouter = Router({ mergeParams: true });

/**
 * POST /api/sessions/:id/feedback
 * Scores the session and returns a FeedbackReport.
 * Idempotent — calling it again returns the cached report with the same report_id.
 */
feedbackRouter.post('/', (req: import('express').Request<{ id: string }>, res) => {
  const { id } = req.params;
  const state = getSession(id);

  if (!state) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (state.status !== 'completed' || !state.final_transcript) {
    return res.status(409).json({
      error: 'Session not completed — end the session with a refer or no_action decision before requesting feedback',
    });
  }

  const cached = getReport(id);
  if (cached) {
    return res.json(cached);
  }

  const rubric = loadRubric();
  const report = scoreSession(state.final_transcript, state.scenario_card, rubric);
  setReport(id, report);

  return res.status(201).json(report);
});

/**
 * GET /api/sessions/:id/feedback
 * Returns a previously generated report.
 * 404 if the session does not exist or feedback has not been generated yet.
 */
feedbackRouter.get('/', (req: import('express').Request<{ id: string }>, res) => {
  const { id } = req.params;

  if (!getSession(id)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const report = getReport(id);
  if (!report) {
    return res.status(404).json({ error: 'Feedback not yet generated — call POST /feedback first' });
  }

  return res.json(report);
});
