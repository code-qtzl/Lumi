import { Router } from 'express';
import { z } from 'zod';

// ── Zod schemas (mirror scenario-card.schema.json) ───────────────────────────

const PersonaSchema = z.object({
	name: z.string().min(1),
	traveling_with: z.string().min(1),
	backstory: z.string().min(1),
});

const EmotionalPresentationSchema = z.object({
	label: z.string().min(1),
	voice_direction: z.string().optional(),
});

const GroundTruthSchema = z.object({
	type: z.enum(['trafficking', 'innocent']),
	indicators_present: z.array(z.string()),
});

const RevealSchema = z.object({
	summary: z.string().min(1),
	teaching_points: z.array(z.string()),
});

const ScenarioCardSchema = z.object({
	scenario_id: z
		.string()
		.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'scenario_id must be kebab-case (e.g. "father-daughter-holiday")'),
	title: z.string().min(1),
	difficulty: z.number().int().min(1).max(3).optional(),
	persona: PersonaSchema,
	role_play_instructions: z.string().min(1),
	emotional_presentation: EmotionalPresentationSchema,
	ground_truth: GroundTruthSchema,
	reveal: RevealSchema,
});

type ScenarioCard = z.infer<typeof ScenarioCardSchema>;

// ── Trainee-safe view (no ground_truth / reveal / backstory / role_play_instructions) ─

type ScenarioListItem = Pick<ScenarioCard, 'scenario_id' | 'title' | 'difficulty'>;

type ScenarioPublicView = Omit<
	ScenarioCard,
	'ground_truth' | 'reveal' | 'role_play_instructions' | 'persona'
> & {
	persona: Omit<ScenarioCard['persona'], 'backstory'>;
};

function toListItem(s: ScenarioCard): ScenarioListItem {
	return { scenario_id: s.scenario_id, title: s.title, difficulty: s.difficulty };
}

function toPublicView(s: ScenarioCard): ScenarioPublicView {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { ground_truth, reveal, role_play_instructions, ...rest } = s;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { backstory, ...personaPublic } = rest.persona;
	return { ...rest, persona: personaPublic };
}

// ── In-memory store (seeded with the example scenario) ───────────────────────

const SEED: ScenarioCard[] = [
	{
		scenario_id: 'father-daughter-holiday',
		title: 'Father and teenage daughter, delayed connection',
		difficulty: 1,
		persona: {
			name: 'Maya',
			traveling_with: 'her father',
			backstory:
				"Maya (16) is flying with her father to visit her grandmother. Their connection was delayed; both are tired and irritable. Maya is glued to her phone and gives short answers because she is a tired teenager, not because anything is wrong.",
		},
		role_play_instructions:
			"Give short, mildly annoyed answers. Warm up noticeably if the trainee is patient and asks open questions ('We're going to see my grandma, she's making pierogi'). If the trainee is accusatory or separates you from your father aggressively, become anxious and shut down — an innocent teen under pressure looks 'suspicious' too.",
		emotional_presentation: {
			label: 'ordinary-nervous',
			voice_direction:
				'Tired teenager: flat, clipped, slightly impatient. Softens when treated kindly; voice tightens if pressed.',
		},
		ground_truth: {
			type: 'innocent',
			indicators_present: [],
		},
		reveal: {
			summary:
				'Nothing was wrong. Maya is a tired 16-year-old traveling with her father. Short answers and phone-avoidance were ordinary teenage behavior, not indicators.',
			teaching_points: [
				'Terse answers and eye-contact avoidance are weak signals on their own — look for behavioral clusters (document control, third-party answering, itinerary ignorance).',
				'Accusatory pressure makes innocent travelers look evasive; open questions let benign explanations surface.',
				'The correct outcome is no referral — escalating here would burden an innocent family.',
			],
		},
	},
];

const store = new Map<string, ScenarioCard>(SEED.map((s) => [s.scenario_id, s]));

/** Resets the store to the seeded state. Call in test beforeEach. */
export function __resetForTesting(): void {
	store.clear();
	for (const s of SEED) store.set(s.scenario_id, s);
}

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /scenarios
 * Returns a list of all scenarios (id, title, difficulty only).
 * Safe to send to the trainee — no ground truth or reveal data.
 */
router.get('/', (_req, res) => {
	const list: ScenarioListItem[] = Array.from(store.values()).map(toListItem);
	res.json(list);
});

/**
 * GET /scenarios/:id
 * Returns the trainee-safe view of one scenario.
 * Omits ground_truth, reveal, role_play_instructions, and persona.backstory.
 */
router.get('/:id', (req, res) => {
	const scenario = store.get(req.params.id);
	if (!scenario) {
		return res.status(404).json({ error: `Scenario '${req.params.id}' not found.` });
	}
	res.json(toPublicView(scenario));
});

/**
 * GET /scenarios/:id/reveal
 * Returns the full scenario card including ground_truth and reveal.
 * Intended for the post-session debrief only.
 */
router.get('/:id/reveal', (req, res) => {
	const scenario = store.get(req.params.id);
	if (!scenario) {
		return res.status(404).json({ error: `Scenario '${req.params.id}' not found.` });
	}
	res.json(scenario);
});

/**
 * POST /scenarios
 * Validates and stores a new scenario card.
 * Body must conform to scenario-card.schema.json.
 */
router.post('/', (req, res) => {
	const result = ScenarioCardSchema.safeParse(req.body);
	if (!result.success) {
		const formatted = result.error.issues.map((e) => ({
			field: e.path.join('.'),
			message: e.message,
		}));
		return res.status(400).json({ error: 'Validation failed', details: formatted });
	}

	const scenario = result.data;
	if (store.has(scenario.scenario_id)) {
		return res.status(409).json({ error: `Scenario '${scenario.scenario_id}' already exists.` });
	}

	store.set(scenario.scenario_id, scenario);
	res.status(201).json(toPublicView(scenario));
});

/**
 * DELETE /scenarios/:id
 * Removes a scenario from the store.
 */
router.delete('/:id', (req, res) => {
	if (!store.has(req.params.id)) {
		return res.status(404).json({ error: `Scenario '${req.params.id}' not found.` });
	}
	store.delete(req.params.id);
	res.status(204).send();
});

export default router;
