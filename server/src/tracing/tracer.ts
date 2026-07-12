/**
 * Minimal trace logger for the session runtime.
 *
 * Records every operation with: timestamp, event name, structured payload.
 * Trace logs are written to a JSONL file and also kept in memory for the trace page.
 *
 * From the roadmap: "Includes trace logging from the first call: prompt version
 * (git hash), pinned model string, params, request/response per turn"
 *
 * For the fixture phase, prompt_version and model are placeholders.
 * They become real when the LLM traveler is plugged in.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const TRACE_DIR = '.traces';
// Computed per write — a server running past midnight rolls to the new day's file.
const traceFile = () => path.join(TRACE_DIR, `trace-${new Date().toISOString().slice(0, 10)}.jsonl`);

// In-memory trace buffer for the dev trace page
const traceBuffer: TraceEntry[] = [];
const MAX_BUFFER = 1000;

export interface TraceEntry {
  timestamp: string;
  event: string;
  prompt_version?: string;
  model?: string;
  params?: Record<string, unknown>;
  request?: unknown;
  response?: unknown;
  data: Record<string, unknown>;
}

// Prompt version = git commit at process start; placeholder outside a git repo.
const gitHash: string = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'fixture-dev';
  }
})();

/**
 * Record a trace entry.
 */
export function trace(event: string, data: Record<string, unknown>, meta?: Partial<Omit<TraceEntry, 'timestamp' | 'event' | 'data'>>): void {
  const entry: TraceEntry = {
    timestamp: new Date().toISOString(),
    event,
    prompt_version: meta?.prompt_version || gitHash,
    model: meta?.model || 'fixture',
    params: meta?.params,
    request: meta?.request,
    response: meta?.response,
    data,
  };

  traceBuffer.push(entry);
  if (traceBuffer.length > MAX_BUFFER) traceBuffer.shift();

  // Write to file (async, fire-and-forget — must never block or break a request)
  try {
    if (!fs.existsSync(TRACE_DIR)) fs.mkdirSync(TRACE_DIR, { recursive: true });
    fs.appendFile(traceFile(), JSON.stringify(entry) + '\n', () => { /* best-effort */ });
  } catch {
    // Silently fail — tracing should never break the app
  }
}

/**
 * Get all in-memory trace entries.
 */
export function getTraceBuffer(): TraceEntry[] {
  return [...traceBuffer];
}

/**
 * Get traces filtered by session_id.
 */
export function getSessionTraces(sessionId: string): TraceEntry[] {
  return traceBuffer.filter(e => e.data?.session_id === sessionId);
}