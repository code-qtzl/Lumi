/**
 * Trace routes — dev-only visibility into the session runtime.
 *
 *   GET /api/traces              — all traces (optionally ?session_id=)
 *   GET /api/traces/:session_id  — traces for one session
 */

import { Router } from 'express';
import { getTraceBuffer, getSessionTraces } from '../tracing/tracer';

export const tracesRouter = Router();

tracesRouter.get('/', (req, res) => {
  const { session_id } = req.query;
  const traces = session_id
    ? getSessionTraces(session_id as string)
    : getTraceBuffer();
  return res.json({ traces, count: traces.length });
});

tracesRouter.get('/:session_id', (req, res) => {
  const traces = getSessionTraces(req.params.session_id);
  return res.json({ traces, count: traces.length });
});
