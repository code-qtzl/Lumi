import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { __resetForTesting as resetSessions } from '../session/store';

beforeEach(resetSessions);

/** Creates a session and returns its id plus the opening turn(s). */
async function startSession(scenarioId = 'father-daughter-holiday') {
  const res = await request(app)
    .post('/api/sessions')
    .send({ scenario_id: scenarioId });
  return res.body as { session_id: string; opening_turns: { turn_id: string }[] };
}

/** Creates, ends, and returns the session_id of a completed session. */
async function completedSession(decision: 'refer' | 'no_action' = 'no_action') {
  const { session_id } = await startSession();
  await request(app)
    .post(`/api/sessions/${session_id}/end`)
    .send({ decision, stated_reason: 'Test' });
  return session_id;
}

// ── GET /api/sessions/:id/transcript ─────────────────────────────────────────

describe('GET /api/sessions/:id/transcript', () => {
  it('returns 200 with the transcript for a completed session', async () => {
    const id = await completedSession();
    const res = await request(app).get(`/api/sessions/${id}/transcript`);

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBeDefined();
  });

  it('transcript has all required fields', async () => {
    const id = await completedSession('no_action');
    const { body } = await request(app).get(`/api/sessions/${id}/transcript`);
    const t = body.transcript;

    expect(t.session_id).toBe(id);
    expect(t.scenario_id).toBe('father-daughter-holiday');
    expect(t.mode).toBe('text');
    expect(t.started_at).toBeTruthy();
    expect(t.ended_at).toBeTruthy();
    expect(Array.isArray(t.turns)).toBe(true);
    expect(t.decision.value).toBe('no_action');
  });

  it('transcript turns are in chronological order (t001, t002, …)', async () => {
    const { session_id } = await startSession();
    await request(app)
      .post(`/api/sessions/${session_id}/turn`)
      .send({ text: 'Where are you headed?' });
    await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({ decision: 'no_action' });

    const { body } = await request(app).get(`/api/sessions/${session_id}/transcript`);
    const ids: string[] = body.transcript.turns.map((t: { turn_id: string }) => t.turn_id);

    // Each turn_id should be numerically greater than the previous
    for (let i = 1; i < ids.length; i++) {
      const prev = parseInt(ids[i - 1].replace('t', ''));
      const curr = parseInt(ids[i].replace('t', ''));
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it('returns 409 when the session is still active', async () => {
    const { session_id } = await startSession();
    const res = await request(app).get(`/api/sessions/${session_id}/transcript`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for an unknown session id', async () => {
    const res = await request(app).get('/api/sessions/sess-does-not-exist/transcript');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('matches the transcript returned by POST /end', async () => {
    const { session_id } = await startSession();
    const endRes = await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({ decision: 'refer' });

    const getRes = await request(app).get(`/api/sessions/${session_id}/transcript`);

    expect(getRes.body.transcript.session_id).toBe(endRes.body.transcript.session_id);
    expect(getRes.body.transcript.turns).toHaveLength(endRes.body.transcript.turns.length);
    expect(getRes.body.transcript.decision.value).toBe(endRes.body.transcript.decision.value);
  });
});

// ── POST /api/sessions ────────────────────────────────────────────────────────

describe('POST /api/sessions', () => {
  it('returns 201 with session_id, traveler_name, and opening_turns', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ scenario_id: 'father-daughter-holiday' });

    expect(res.status).toBe(201);
    expect(res.body.session_id).toMatch(/^sess-/);
    expect(res.body.traveler_name).toBe('Maya');
    expect(res.body.opening_turns.length).toBeGreaterThan(0);
    expect(res.body.opening_turns[0].turn_id).toBe('t001');
    expect(res.body.opening_turns[0].role).toBe('traveler');
  });

  it('returns 400 when scenario_id is missing', async () => {
    const res = await request(app).post('/api/sessions').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for an unknown scenario_id', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ scenario_id: 'does-not-exist' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('each session gets a unique session_id', async () => {
    const a = await request(app).post('/api/sessions').send({ scenario_id: 'father-daughter-holiday' });
    const b = await request(app).post('/api/sessions').send({ scenario_id: 'father-daughter-holiday' });
    expect(a.body.session_id).not.toBe(b.body.session_id);
  });
});

// ── POST /api/sessions/:id/turn ───────────────────────────────────────────────

describe('POST /api/sessions/:id/turn', () => {
  it('returns trainee turn and traveler reply', async () => {
    const { session_id } = await startSession();
    const res = await request(app)
      .post(`/api/sessions/${session_id}/turn`)
      .send({ text: 'Where are you headed?' });

    expect(res.status).toBe(200);
    expect(res.body.turn.role).toBe('trainee');
    expect(res.body.turn.text).toBe('Where are you headed?');
    expect(res.body.traveler_turns.length).toBeGreaterThan(0);
    expect(res.body.session_status).toBe('active');
  });

  it('turn_ids increment sequentially after the opening turn', async () => {
    const { session_id, opening_turns } = await startSession();
    const openingCount = opening_turns.length;

    const res = await request(app)
      .post(`/api/sessions/${session_id}/turn`)
      .send({ text: 'Hello.' });

    const traineeTurnNum = parseInt(res.body.turn.turn_id.replace('t', ''));
    expect(traineeTurnNum).toBe(openingCount + 1);
  });

  it('returns 400 when text is empty', async () => {
    const { session_id } = await startSession();
    const res = await request(app)
      .post(`/api/sessions/${session_id}/turn`)
      .send({ text: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when text is missing', async () => {
    const { session_id } = await startSession();
    const res = await request(app)
      .post(`/api/sessions/${session_id}/turn`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown session', async () => {
    const res = await request(app)
      .post('/api/sessions/sess-fake/turn')
      .send({ text: 'Hello.' });
    expect(res.status).toBe(404);
  });

  it('returns 409 on a completed session', async () => {
    const { session_id } = await startSession();
    await request(app).post(`/api/sessions/${session_id}/end`).send({ decision: 'no_action' });

    const res = await request(app)
      .post(`/api/sessions/${session_id}/turn`)
      .send({ text: 'One more question.' });
    expect(res.status).toBe(409);
  });
});

// ── POST /api/sessions/:id/end ────────────────────────────────────────────────

describe('POST /api/sessions/:id/end', () => {
  it('returns the transcript with the committed decision', async () => {
    const { session_id } = await startSession();
    const res = await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({ decision: 'no_action', stated_reason: 'No indicators observed' });

    expect(res.status).toBe(200);
    expect(res.body.ended).toBe(true);
    expect(res.body.transcript.decision.value).toBe('no_action');
    expect(res.body.transcript.decision.stated_reason).toBe('No indicators observed');
  });

  it('transcript includes all turns up to the decision', async () => {
    const { session_id, opening_turns } = await startSession();
    await request(app).post(`/api/sessions/${session_id}/turn`).send({ text: 'Question 1.' });
    const res = await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({ decision: 'refer' });

    // Opening turn(s) + trainee turn + traveler reply
    expect(res.body.transcript.turns.length).toBeGreaterThan(opening_turns.length);
  });

  it('returns 400 for an invalid decision value', async () => {
    const { session_id } = await startSession();
    const res = await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({ decision: 'maybe' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when decision is missing', async () => {
    const { session_id } = await startSession();
    const res = await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown session', async () => {
    const res = await request(app)
      .post('/api/sessions/sess-fake/end')
      .send({ decision: 'no_action' });
    expect(res.status).toBe(404);
  });

  it('returns 409 when called twice on the same session', async () => {
    const { session_id } = await startSession();
    await request(app).post(`/api/sessions/${session_id}/end`).send({ decision: 'no_action' });
    const res = await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({ decision: 'refer' });
    expect(res.status).toBe(409);
  });
});

// ── GET /api/sessions/:id/reveal (the only reveal path) ──────────────────────

describe('GET /api/sessions/:id/reveal', () => {
  it('409s while the session is active — ground truth stays hidden', async () => {
    const { session_id } = await startSession();
    const res = await request(app).get(`/api/sessions/${session_id}/reveal`);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('ground_truth');
  });

  it('returns the full card (ground truth, reveal) once completed', async () => {
    const id = await completedSession('no_action');
    const res = await request(app).get(`/api/sessions/${id}/reveal`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ground_truth');
    expect(res.body).toHaveProperty('reveal');
    expect(res.body.persona).toHaveProperty('backstory');
  });

  it('404s for an unknown session', async () => {
    const res = await request(app).get('/api/sessions/sess-nope/reveal');
    expect(res.status).toBe(404);
  });
});

// ── Robustness: malformed bodies must never kill the process ─────────────────

describe('malformed request bodies', () => {
  it('POST /api/sessions with a non-JSON body returns 400, server survives', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Content-Type', 'text/plain')
      .send('not json');
    expect(res.status).toBe(400);
    // Server is still alive and serving
    const alive = await request(app).get('/api/scenarios');
    expect(alive.status).toBe(200);
  });

  it('POST /:id/turn and /:id/end with empty bodies return 400', async () => {
    const { session_id } = await startSession();
    const turn = await request(app).post(`/api/sessions/${session_id}/turn`).send();
    expect(turn.status).toBe(400);
    const end = await request(app).post(`/api/sessions/${session_id}/end`).send();
    expect(end.status).toBe(400);
  });

  it('rejects a non-string stated_reason (transcript contract)', async () => {
    const { session_id } = await startSession();
    const res = await request(app)
      .post(`/api/sessions/${session_id}/end`)
      .send({ decision: 'refer', stated_reason: { nested: true } });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid mode', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ scenario_id: 'father-daughter-holiday', mode: 'banana' });
    expect(res.status).toBe(400);
  });
});

// ── Rate limiting actually applies to session creation ───────────────────────

describe('session-create rate limit', () => {
  it('kicks in before the router when NODE_ENV is not test', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development'; // limiter skip() reads this per request
    try {
      let limited = false;
      for (let i = 0; i < 25; i++) {
        const res = await request(app)
          .post('/api/sessions')
          .send({ scenario_id: 'father-daughter-holiday' });
        if (res.status === 429) { limited = true; break; }
      }
      expect(limited).toBe(true);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
