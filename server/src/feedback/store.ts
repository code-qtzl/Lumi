import * as fs from 'fs';
import * as path from 'path';
import { FeedbackReport } from '../contracts';

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'reports.json');

const reports = new Map<string, FeedbackReport>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const entries: [string, FeedbackReport][] = JSON.parse(raw);
      for (const [id, report] of entries) reports.set(id, report);
      console.log(`[feedback-store] Loaded ${reports.size} report(s) from disk`);
    }
  } catch (err) {
    console.warn('[feedback-store] Could not load reports from disk:', err);
  }
}

function persist(): void {
  // Tests must never write through to the real data file — parallel vitest
  // workers race on it and leftover test reports load as real ones next boot.
  if (process.env.NODE_ENV === 'test') return;
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(Array.from(reports.entries()), null, 2));
  } catch (err) {
    console.warn('[feedback-store] Could not persist reports to disk:', err);
  }
}

export function getReport(sessionId: string): FeedbackReport | undefined {
  ensureLoaded();
  return reports.get(sessionId);
}

export function setReport(sessionId: string, report: FeedbackReport): void {
  ensureLoaded();
  reports.set(sessionId, report);
  persist();
}

export function listReports(): FeedbackReport[] {
  ensureLoaded();
  return Array.from(reports.values());
}

export function __resetForTesting(): void {
  reports.clear();
  loaded = true; // Prevent loading from disk during tests
}