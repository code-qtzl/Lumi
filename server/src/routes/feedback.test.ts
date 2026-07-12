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

// ── POST /api/sessions/:id/feedback ──────────────────────────────────────────

describe('POST /api/sessions/:id/feedback', () => {
  it('returns 201 with a valid FeedbackReport for a completed session', async () => {
    const id = await completedSession('no_action');
    const res = await request(app).post(`/api/sessions/${id}/feedback`);

    expect(res.status).toBe(201);
    expect(res.body.report_id).toBe(`rpt-${id}`);
    expect(res.body.session_id).toBe(id);
    expect(res.body.scenario_id).toBe('father-daughter-holiday');
    expect(res.body.rubric_version).toBe('0.1');
  });

  it('report contains all 5 rubric dimensions with scores in range 1–5', async () => {
    const id = await completedSession();
    const res = await request(app).post(`/api/sessions/${id}/feedback`);

    expect(res.body.dimensions).toHaveLength(5);
    for (const dim of res.body.dimensions) {
      expect(dim.score).toBeGreaterThanOrEqual(1);
      expect(dim.score).toBeLessThanOrEqual(5);
      expect(dim.rationale).toBeTruthy();
      expect(Array.isArray(dim.anchors)).toBe(true);
    }
  });

  it('report contains a decision_outcome reflecting the trainee decision', async () => {
    const id = await completedSession('no_action');
    const res = await request(app).post(`/api/sessions/${id}/feedback`);

    expect(res.body.decision_outcome.trainee_decision).toBe('no_action');
    expect(res.body.decision_outcome.ground_truth_type).toBe('innocent');
    expect(res.body.decision_outcome.appropriate).toBe(true);
  });

  it('appropriate is false when trainee makes the wrong decision', async () => {
    const id = await completedSession('refer'); // innocent scenario — refer is wrong
    const res = await request(app).post(`/api/sessions/${id}/feedback`);

    expect(res.body.decision_outcome.trainee_decision).toBe('refer');
    expect(res.body.decision_outcome.appropriate).toBe(false);
  });

  it('is idempotent — calling twice returns the same report_id and 200', async () => {
    const id = await completedSession();
    await request(app).post(`/api/sessions/${id}/feedback`);
    const second = await request(app).post(`/api/sessions/${id}/feedback`);

    expect(second.status).toBe(200);
    expect(second.body.report_id).toBe(`rpt-${id}`);
  });

  it('returns 409 when the session is still active', async () => {
    const create = await request(app)
      .post('/api/sessions')
      .send({ scenario_id: 'father-daughter-holiday' });
    const id: string = create.body.session_id;

    const res = await request(app).post(`/api/sessions/${id}/feedback`);
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for an unknown session', async () => {
    const res = await request(app).post('/api/sessions/sess-does-not-exist/feedback');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ── GET /api/sessions/:id/feedback ───────────────────────────────────────────

describe('GET /api/sessions/:id/feedback', () => {
  it('returns 200 with the cached report after POST', async () => {
    const id = await completedSession();
    const posted = await request(app).post(`/api/sessions/${id}/feedback`);
    const got = await request(app).get(`/api/sessions/${id}/feedback`);

    expect(got.status).toBe(200);
    expect(got.body.report_id).toBe(posted.body.report_id);
  });

  it('returns 404 if feedback has not been generated yet', async () => {
    const id = await completedSession();
    const res = await request(app).get(`/api/sessions/${id}/feedback`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/POST/);
  });

  it('returns 404 for an unknown session', async () => {
    const res = await request(app).get('/api/sessions/sess-does-not-exist/feedback');
    expect(res.status).toBe(404);
  });
});
