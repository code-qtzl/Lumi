/**
 * Scenario routes — trainee-safe views + authoring CRUD (U7 groundwork).
 *
 *   GET    /api/scenarios      — list (id, title, difficulty — no ground truth)
 *   GET    /api/scenarios/:id  — trainee-safe view (no ground_truth / reveal /
 *                                role_play_instructions / persona.backstory)
 *   POST   /api/scenarios      — validate + add a card (schema = shared contract)
 *   DELETE /api/scenarios/:id  — remove a card
 *
 * Backed by the scenario registry — the SAME store sessions resolve cards
 * from, so an authored scenario is immediately playable and the shipped
 * archetypes are always listed. Validation uses the shared JSON Schema
 * (shared/contracts/scenario-card.schema.json) — one source of truth, no
 * hand-mirrored validators. The scenario reveal lives on the SESSION
 * (GET /api/sessions/:id/reveal, completed sessions only) — there is
 * deliberately no public reveal endpoint here.
 */

import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import Ajv2020, { ErrorObject } from 'ajv/dist/2020';
import { ScenarioCard } from '../contracts';
import {
  getScenarioCard,
  listScenarios,
  addScenarioCard,
  deleteScenarioCard,
} from '../scenarios/registry';

// ── Contract validation (shared schema + indicator catalog) ──────────────────

const CONTRACTS_DIR = path.join(__dirname, '..', '..', '..', 'shared', 'contracts');

const ajv = new Ajv2020({ allErrors: true });
const validateCard = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'scenario-card.schema.json'), 'utf-8')),
);
const knownIndicators = new Set<string>(
  JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'indicator-catalog.json'), 'utf-8'))
    .indicators.map((i: { id: string }) => i.id),
);

function formatErrors(errors: ErrorObject[] | null | undefined): Array<{ field: string; message: string }> {
  return (errors ?? []).map(e => ({
    field: e.instancePath.replace(/^\//, '').replace(/\//g, '.') || '(root)',
    message: e.message ?? 'invalid',
  }));
}

// ── Trainee-safe views (no ground_truth / reveal / backstory / instructions) ──

type ScenarioPublicView = Omit<
  ScenarioCard,
  'ground_truth' | 'reveal' | 'role_play_instructions' | 'persona'
> & {
  persona: Omit<ScenarioCard['persona'], 'backstory'>;
};

function toPublicView(s: ScenarioCard): ScenarioPublicView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ground_truth, reveal, role_play_instructions, ...rest } = s;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { backstory, ...personaPublic } = rest.persona;
  return { ...rest, persona: personaPublic };
}

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

/** GET /scenarios — list (safe to send to the trainee). */
router.get('/', (_req, res) => {
  res.json(listScenarios());
});

/** GET /scenarios/:id — trainee-safe view of one scenario. */
router.get('/:id', (req, res) => {
  const scenario = getScenarioCard(req.params.id);
  if (!scenario) {
    return res.status(404).json({ error: `Scenario '${req.params.id}' not found.` });
  }
  res.json(toPublicView(scenario));
});

/**
 * POST /scenarios — validate against the shared contract and add to the
 * registry (immediately playable in sessions).
 */
router.post('/', (req, res) => {
  const body = req.body ?? {};

  if (!validateCard(body)) {
    return res.status(400).json({ error: 'Validation failed', details: formatErrors(validateCard.errors) });
  }
  const scenario = body as unknown as ScenarioCard;

  const unknownIndicators = scenario.ground_truth.indicators_present.filter(i => !knownIndicators.has(i));
  if (unknownIndicators.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: unknownIndicators.map(i => ({
        field: 'ground_truth.indicators_present',
        message: `unknown indicator '${i}' — must be an id from indicator-catalog.json`,
      })),
    });
  }

  if (getScenarioCard(scenario.scenario_id)) {
    return res.status(409).json({ error: `Scenario '${scenario.scenario_id}' already exists.` });
  }

  addScenarioCard(scenario);
  res.status(201).json(toPublicView(scenario));
});

/** DELETE /scenarios/:id — remove a scenario. */
router.delete('/:id', (req, res) => {
  if (!deleteScenarioCard(req.params.id)) {
    return res.status(404).json({ error: `Scenario '${req.params.id}' not found.` });
  }
  res.status(204).send();
});

export default router;
