/**
 * In-memory session store with JSON file write-through persistence.
 *
 * Sessions survive server restarts — the JSON file is written on every
 * update and loaded once on first access. Swap the read/write functions
 * for a real DB without changing any callers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SessionState } from './types';

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'sessions.json');

const sessions = new Map<string, SessionState>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const entries: [string, SessionState][] = JSON.parse(raw);
      for (const [id, state] of entries) sessions.set(id, state);
      console.log(`[store] Loaded ${sessions.size} session(s) from disk`);
    }
  } catch (err) {
    console.warn('[store] Could not load sessions from disk:', err);
  }
}

function persist(): void {
  // Tests must never write through to the real data file — parallel vitest
  // workers race on it and leftover test sessions load as real ones next boot.
  if (process.env.NODE_ENV === 'test') return;
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(Array.from(sessions.entries()), null, 2));
  } catch (err) {
    console.warn('[store] Could not persist sessions to disk:', err);
  }
}

export function getSession(sessionId: string): SessionState | undefined {
  ensureLoaded();
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, state: SessionState): void {
  ensureLoaded();
  sessions.set(sessionId, state);
  persist();
}

export function deleteSession(sessionId: string): boolean {
  ensureLoaded();
  const deleted = sessions.delete(sessionId);
  if (deleted) persist();
  return deleted;
}

export function listActiveSessions(): SessionState[] {
  ensureLoaded();
  return Array.from(sessions.values()).filter(s => s.status !== 'completed');
}

export function sessionCount(): number {
  ensureLoaded();
  return sessions.size;
}

export function __resetForTesting(): void {
  sessions.clear();
  loaded = true; // Prevent loading from disk during tests
}
