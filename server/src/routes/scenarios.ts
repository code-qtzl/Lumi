/**
 * Scenario routes.
 *
 *   GET /api/scenarios — list available scenarios (id + title only; no ground truth)
 */

import { Router } from 'express';
import { listScenarios } from '../scenarios/registry';

export const scenariosRouter = Router();

scenariosRouter.get('/', (_req, res) => {
  res.json({ scenarios: listScenarios() });
});
