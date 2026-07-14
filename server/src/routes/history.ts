/**
 * History routes — list all completed training sessions with feedback reports.
 *
 *   GET /api/history  — list all reports (for history page)
 */

import { Router } from 'express';
import { listReports } from '../feedback/store';

export const historyRouter = Router();

/**
 * GET /api/history
 * Returns all feedback reports for the history view.
 * Each report includes session_id, scenario_id, and decision_outcome.
 */
historyRouter.get('/', (_req, res) => {
  const reports = listReports();
  return res.json({ reports });
});