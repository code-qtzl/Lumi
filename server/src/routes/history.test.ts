import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { __resetForTesting as resetSessions } from '../session/store';
import { __resetForTesting as resetReports } from '../feedback/store';

// One cookie-carrying agent per test = one trainee (identity.ts).
let agent: ReturnType<typeof request.agent>;

beforeEach(() => {
  resetSessions();
  resetReports();
  agent = request.agent(app);
});

/** Creates a session and immediately ends it, returning the session_id. */
async function completedSession(decision: 'refer' | 'no_action' = 'no_action', as = agent): Promise<string> {
  const create = await as
    .post('/api/sessions')
    .send({ scenario_id: 'father-daughter-holiday' });
  const sessionId: string = create.body.session_id;

  await as
    .post(`/api/sessions/${sessionId}/end`)
    .send({ decision, stated_reason: 'Test run' });

  return sessionId;
}

// ── GET /api/history ─────────────────────────────────────────────

describe('GET /api/history', () => {
  it('returns 200 with an empty reports array when no sessions completed', async () => {
    const res = await agent.get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual([]);
  });

  it('returns all completed session reports', async () => {
    const id1 = await completedSession('no_action');
    const id2 = await completedSession('refer');

    // Generate feedback for both
    await agent.post(`/api/sessions/${id1}/feedback`);
    await agent.post(`/api/sessions/${id2}/feedback`);

    const res = await agent.get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(2);

    const sessionIds = res.body.reports.map((r: { session_id: string }) => r.session_id);
    expect(sessionIds).toContain(id1);
    expect(sessionIds).toContain(id2);
  });

  it('reports include decision_outcome and dimensions', async () => {
    const id = await completedSession('no_action');
    await agent.post(`/api/sessions/${id}/feedback`);

    const res = await agent.get('/api/history');
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
    await agent.post(`/api/sessions/${id}/feedback`);

    const clear = await agent.delete('/api/history');
    expect(clear.status).toBe(204);

    const remaining = await agent.get('/api/history');
    expect(remaining.body.reports).toEqual([]);
  });
});

// ── Per-trainee isolation (identity.ts) ─────────────────────────────────────

describe('trainee isolation', () => {
  it('each trainee sees only their own history', async () => {
    const other = request.agent(app);
    const mine = await completedSession('no_action');
    const theirs = await completedSession('refer', other);
    await agent.post(`/api/sessions/${mine}/feedback`);
    await other.post(`/api/sessions/${theirs}/feedback`);

    const res = await agent.get('/api/history');
    expect(res.body.reports.map((r: { session_id: string }) => r.session_id)).toEqual([mine]);
  });

  it('clearing history leaves other trainees\' reports intact', async () => {
    const other = request.agent(app);
    const theirs = await completedSession('refer', other);
    await other.post(`/api/sessions/${theirs}/feedback`);

    await agent.delete('/api/history');

    const res = await other.get('/api/history');
    expect(res.body.reports).toHaveLength(1);
  });

  it('another trainee\'s session is 404 on every route, as if it did not exist', async () => {
    const other = request.agent(app);
    const theirs = await completedSession('no_action', other);
    await other.post(`/api/sessions/${theirs}/feedback`);

    for (const res of [
      await agent.get(`/api/sessions/${theirs}`),
      await agent.get(`/api/sessions/${theirs}/transcript`),
      await agent.get(`/api/sessions/${theirs}/reveal`),
      await agent.get(`/api/sessions/${theirs}/feedback`),
      await agent.post(`/api/sessions/${theirs}/feedback`),
      await agent.post(`/api/sessions/${theirs}/turn`).send({ text: 'Hello?' }),
      await agent.post(`/api/sessions/${theirs}/end`).send({ decision: 'refer' }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    }
  });

  it('a tampered identity cookie gets a fresh identity, not the forged one', async () => {
    const id = await completedSession();
    const forged = await request(app)
      .get(`/api/sessions/${id}`)
      .set('Cookie', 'lumi_tid=local.forged-signature');
    expect(forged.status).toBe(404);
    expect(forged.headers['set-cookie']?.[0]).toMatch(/^lumi_tid=/);
  });
});
