/**
 * Lumi app server — thin mount point.
 *
 * Route handlers live in src/routes/ (one file per domain). Keep this file
 * minimal: parallel branches add their own routers here, so merges stay
 * additive. Training-sim routes are namespaced under /api/*.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { sessionsRouter } from './routes/sessions';
import { scenariosRouter } from './routes/scenarios';
import { tracesRouter } from './routes/traces';
import { listScenarios, loadScenarioCards } from './scenarios/registry';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Load scenario cards on startup
loadScenarioCards();

app.use('/api/scenarios', scenariosRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/traces', tracesRouter);

app.listen(PORT, () => {
  console.log(`[server] Session runtime running on http://localhost:${PORT}`);
  console.log(`[server] Scenarios: ${listScenarios().length} loaded`);
});
