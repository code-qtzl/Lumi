/**
 * History routes — the calling trainee's completed sessions with feedback reports.
 *
 *   GET    /api/history  — list this trainee's reports (for history page)
 *   DELETE /api/history  — clear this trainee's stored reports
 */

import { Router } from 'express';
import { deleteReports, listReports } from '../feedback/store';
import { getSession } from '../session/store';
import { FeedbackReport } from '../contracts';

export const historyRouter = Router();

/** Reports are owned through their session — the report contract carries no owner. */
function ownReports(traineeId: string): FeedbackReport[] {
  return listReports().filter(r => getSession(r.session_id)?.owner_id === traineeId);
}

/**
 * GET /api/history
 * Returns the trainee's feedback reports for the history view.
 * Each report includes session_id, scenario_id, and decision_outcome.
 */
historyRouter.get('/', (req, res) => {
  return res.json({ reports: ownReports(req.traineeId) });
});

historyRouter.delete('/', (req, res) => {
  deleteReports(ownReports(req.traineeId).map(r => r.session_id));
  return res.status(204).end();
});
