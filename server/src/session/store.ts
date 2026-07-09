/**
 * In-memory session store.
 *
 * Schema of record; can be swapped for SQLite later without changing endpoints.
 */

import { SessionState } from './types';

const sessions = new Map<string, SessionState>();

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, state: SessionState): void {
  sessions.set(sessionId, state);
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listActiveSessions(): SessionState[] {
  return Array.from(sessions.values()).filter(s => s.status !== 'completed');
}

export function sessionCount(): number {
  return sessions.size;
}