import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { __resetForTesting } from '../scenarios/registry';

// Registry seeds from shared/contracts/examples: the two parent archetypes
// (AC4: both must be playable) plus any generated variants (*.gen.json).
const SEED_ID = 'father-daughter-holiday';
async function poolSize(): Promise<number> {
	const res = await request(app).get('/api/scenarios');
	return (res.body as unknown[]).length;
}

const VALID_NEW_SCENARIO = {
	scenario_id: 'new-scenario',
	title: 'A new test scenario',
	difficulty: 2,
	persona: {
		name: 'Jordan',
		traveling_with: 'an older acquaintance',
		backstory: 'Jordan is being coached on what to say.',
	},
	role_play_instructions: 'Deflect all questions and defer to companion.',
	emotional_presentation: { label: 'coached' },
	ground_truth: { type: 'trafficking', indicators_present: ['third-party-answers'] },
	reveal: { summary: 'This was a trafficking scenario.', teaching_points: ['Always note who answers.'] },
};

beforeEach(__resetForTesting);

// ── GET /scenarios ────────────────────────────────────────────────────────────

describe('GET /scenarios', () => {
	it('returns 200 with both parent archetypes present (AC4)', async () => {
		const res = await request(app).get('/api/scenarios');
		expect(res.status).toBe(200);
		expect(res.body.length).toBeGreaterThanOrEqual(2);
		const ids = res.body.map((s: { scenario_id: string }) => s.scenario_id);
		expect(ids).toContain('father-daughter-holiday');
		expect(ids).toContain('coached-companion');
	});

	it('list items only contain scenario_id, title, and difficulty', async () => {
		const res = await request(app).get('/api/scenarios');
		const item = res.body.find((s: { scenario_id: string }) => s.scenario_id === SEED_ID);
		expect(item).toMatchObject({ scenario_id: SEED_ID, title: expect.any(String), difficulty: 1 });
		// must NOT leak sensitive fields
		expect(item).not.toHaveProperty('ground_truth');
		expect(item).not.toHaveProperty('reveal');
		expect(item).not.toHaveProperty('role_play_instructions');
		expect(item).not.toHaveProperty('persona');
	});
});

// ── GET /scenarios/:id ────────────────────────────────────────────────────────

describe('GET /scenarios/:id', () => {
	it('returns 200 with the trainee-safe view', async () => {
		const res = await request(app).get(`/api/scenarios/${SEED_ID}`);
		expect(res.status).toBe(200);
		expect(res.body.scenario_id).toBe(SEED_ID);
	});

	it('omits ground_truth, reveal, and role_play_instructions', async () => {
		const res = await request(app).get(`/api/scenarios/${SEED_ID}`);
		expect(res.body).not.toHaveProperty('ground_truth');
		expect(res.body).not.toHaveProperty('reveal');
		expect(res.body).not.toHaveProperty('role_play_instructions');
	});

	it('omits persona.backstory', async () => {
		const res = await request(app).get(`/api/scenarios/${SEED_ID}`);
		expect(res.body.persona).not.toHaveProperty('backstory');
		expect(res.body.persona).toHaveProperty('name');
		expect(res.body.persona).toHaveProperty('traveling_with');
	});

	it('returns 404 for an unknown id', async () => {
		const res = await request(app).get('/api/scenarios/does-not-exist');
		expect(res.status).toBe(404);
		expect(res.body).toHaveProperty('error');
	});
});

// ── No public reveal ──────────────────────────────────────────────────────────

describe('scenario reveal is not publicly reachable', () => {
	it('GET /scenarios/:id/reveal no longer exists (ground truth stays hidden mid-session)', async () => {
		const res = await request(app).get(`/api/scenarios/${SEED_ID}/reveal`);
		expect(res.status).toBe(404);
	});
});

// ── Authored scenarios are playable (single store) ────────────────────────────

describe('authored scenario → session (registry is the one store)', () => {
	it('a scenario created via POST /scenarios can immediately start a session', async () => {
		await request(app).post('/api/scenarios').send(VALID_NEW_SCENARIO);
		const res = await request(app)
			.post('/api/sessions')
			.send({ scenario_id: 'new-scenario' });
		expect(res.status).toBe(201);
		expect(res.body.scenario_id).toBe('new-scenario');
	});

	it('the shipped trafficking archetype can start a session (AC4 regression)', async () => {
		const res = await request(app)
			.post('/api/sessions')
			.send({ scenario_id: 'coached-companion' });
		expect(res.status).toBe(201);
	});
});

// ── POST /scenarios ───────────────────────────────────────────────────────────

describe('POST /scenarios', () => {
	it('returns 201 and the trainee-safe view on success', async () => {
		const res = await request(app).post('/api/scenarios').send(VALID_NEW_SCENARIO);
		expect(res.status).toBe(201);
		expect(res.body.scenario_id).toBe('new-scenario');
		// response must NOT leak sensitive fields
		expect(res.body).not.toHaveProperty('ground_truth');
		expect(res.body).not.toHaveProperty('reveal');
		expect(res.body).not.toHaveProperty('role_play_instructions');
		expect(res.body.persona).not.toHaveProperty('backstory');
	});

	it('persists the scenario so it appears in GET /scenarios', async () => {
		const before = await poolSize();
		await request(app).post('/api/scenarios').send(VALID_NEW_SCENARIO);
		const res = await request(app).get('/api/scenarios');
		expect(res.body).toHaveLength(before + 1);
		expect(res.body.map((s: { scenario_id: string }) => s.scenario_id)).toContain('new-scenario');
	});

	it('returns 400 for indicators not in the shared catalog', async () => {
		const res = await request(app)
			.post('/api/scenarios')
			.send({ ...VALID_NEW_SCENARIO, ground_truth: { type: 'trafficking', indicators_present: ['made-up-indicator'] } });
		expect(res.status).toBe(400);
		const fields = res.body.details.map((d: { field: string }) => d.field);
		expect(fields).toContain('ground_truth.indicators_present');
	});

	it('returns 400 with field-level details when scenario_id is invalid', async () => {
		const res = await request(app)
			.post('/api/scenarios')
			.send({ ...VALID_NEW_SCENARIO, scenario_id: 'Invalid ID with spaces' });
		expect(res.status).toBe(400);
		expect(res.body.error).toBe('Validation failed');
		const fields = res.body.details.map((d: { field: string }) => d.field);
		expect(fields).toContain('scenario_id');
	});

	it('returns 400 when required fields are missing', async () => {
		const res = await request(app).post('/api/scenarios').send({ scenario_id: 'valid-id' });
		expect(res.status).toBe(400);
		expect(res.body.details.length).toBeGreaterThan(0);
	});

	it('returns 400 when difficulty is out of range', async () => {
		const res = await request(app)
			.post('/api/scenarios')
			.send({ ...VALID_NEW_SCENARIO, difficulty: 5 });
		expect(res.status).toBe(400);
		const fields = res.body.details.map((d: { field: string }) => d.field);
		expect(fields).toContain('difficulty');
	});

	it('returns 400 when ground_truth.type is not a valid enum value', async () => {
		const res = await request(app)
			.post('/api/scenarios')
			.send({ ...VALID_NEW_SCENARIO, ground_truth: { type: 'unknown', indicators_present: [] } });
		expect(res.status).toBe(400);
		const fields = res.body.details.map((d: { field: string }) => d.field);
		expect(fields).toContain('ground_truth.type');
	});

	it('returns 409 when scenario_id already exists', async () => {
		const res = await request(app)
			.post('/api/scenarios')
			.send({ ...VALID_NEW_SCENARIO, scenario_id: SEED_ID });
		expect(res.status).toBe(409);
		expect(res.body).toHaveProperty('error');
	});
});

// ── DELETE /scenarios/:id ─────────────────────────────────────────────────────

describe('DELETE /scenarios/:id', () => {
	it('returns 204 and removes the scenario', async () => {
		const del = await request(app).delete(`/api/scenarios/${SEED_ID}`);
		expect(del.status).toBe(204);

		const get = await request(app).get(`/api/scenarios/${SEED_ID}`);
		expect(get.status).toBe(404);
	});

	it('removes the scenario from the list', async () => {
		const before = await poolSize();
		await request(app).delete(`/api/scenarios/${SEED_ID}`);
		const res = await request(app).get('/api/scenarios');
		expect(res.body).toHaveLength(before - 1);
	});

	it('returns 404 for an unknown id', async () => {
		const res = await request(app).delete('/api/scenarios/does-not-exist');
		expect(res.status).toBe(404);
		expect(res.body).toHaveProperty('error');
	});
});
