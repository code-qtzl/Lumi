import { FeedbackReport } from '../contracts';

const reports = new Map<string, FeedbackReport>();

export function getReport(sessionId: string): FeedbackReport | undefined {
  return reports.get(sessionId);
}

export function setReport(sessionId: string, report: FeedbackReport): void {
  reports.set(sessionId, report);
}

export function __resetForTesting(): void {
  reports.clear();
}
