import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { __resetForTesting as resetSessions } from '../session/store';
import { __resetForTesting as resetReports } from '../feedback/store';

beforeEach(() => {
  resetSessions();
  resetReports();
});

/** Creates a session and immediately ends it, returning the session_id. */
async function completedSession(decision: 'refer' | 'no_action' = 'no_action'): Promise<string> {
  const create = await request(app)
    .post('/api/sessions')
    .send({ scenario_id: 'father-daughter-holiday' });
  const sessionId: string = create.body.session_id;

  await request(app)
    .post(`/api/sessions/${sessionId}/end`)
    .send({ decision, stated_reason: 'Test run' });

  return sessionId;
}

// ── GET /api/history ─────────────────────────────────────────────

describe('GET /api/history', () => {
  it('returns 200 with an empty reports array when no sessions completed', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual([]);
  });

  it('returns all completed session reports', async () => {
    const id1 = await completedSession('no_action');
    const id2 = await completedSession('refer');

    // Generate feedback for both
    await request(app).post(`/api/sessions/${id1}/feedback`);
    await request(app).post(`/api/sessions/${id2}/feedback`);

    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(2);

    const sessionIds = res.body.reports.map((r: { session_id: string }) => r.session_id);
    expect(sessionIds).toContain(id1);
    expect(sessionIds).toContain(id2);
  });

  it('reports include decision_outcome and dimensions', async () => {
    const id = await completedSession('no_action');
    await request(app).post(`/api/sessions/${id}/feedback`);

    const res = await request(app).get('/api/history');
    const report = res.body.reports[0];

    expect(report.session_id).toBe(id);
    expect(report.decision_outcome).toHaveProperty('trainee_decision');
    expect(report.decision_outcome).toHaveProperty('ground_truth_type');
    expect(report.decision_outcome).toHaveProperty('appropriate');
    expect(report.dimensions).toHaveLength(5);
  });
});

describe('DELETE /api/history', () => {
  it('clears all saved feedback reports', async () => {
    const id = await completedSession();
    await request(app).post(`/api/sessions/${id}/feedback`);

    const clear = await request(app).delete('/api/history');
    expect(clear.status).toBe(204);

    const remaining = await request(app).get('/api/history');
    expect(remaining.body.reports).toEqual([]);
  });
});
