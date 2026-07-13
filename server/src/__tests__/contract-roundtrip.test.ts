/**
 * Contract round-trip (lumi-eval-plan.md L1 "plain software tests"):
 * a real session played through the engine must emit a transcript that
 * validates against shared/contracts/transcript.schema.json, and the scorer's
 * report must validate against feedback-report.schema.json. The shared
 * schemas are the source of truth — this catches drift the moment either
 * side changes shape.
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { createSession, submitTurn, endSession, getTranscript } from '../session/engine';
import { setTraveler } from '../traveler';
import { fixtureTraveler } from '../traveler/fixture';
import { loadScenarioCards, getScenarioCard } from '../scenarios/registry';
import { scoreSession } from '../eval/scorer';
import { loadRubric } from '../eval/rubric-loader';

const CONTRACTS = path.join(__dirname, '..', '..', '..', 'shared', 'contracts');
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(CONTRACTS, f), 'utf-8'));
const validTranscript = ajv.compile(load('transcript.schema.json'));
const validReport = ajv.compile(load('feedback-report.schema.json'));

beforeAll(() => {
  setTraveler(fixtureTraveler);
  loadScenarioCards();
});

describe.each(['father-daughter-holiday', 'coached-companion'])(
  'contract round-trip: %s',
  scenarioId => {
    it('engine transcript and scorer report are schema-valid', async () => {
      const card = getScenarioCard(scenarioId);
      expect(card).toBeDefined();
      if (!card) return;

      const session = await createSession(card, 'text');
      await submitTurn(session.session_id, 'Where are you headed today?');
      await submitTurn(session.session_id, 'How do you know each other?');
      const ended = endSession(session.session_id, card.ground_truth.type === 'trafficking' ? 'refer' : 'no_action', 'test run');
      expect('error' in ended).toBe(false);

      const transcript = getTranscript(session.session_id);
      if ('error' in transcript) throw new Error(transcript.error);
      expect(validTranscript(transcript)).toBe(true);
      if (validTranscript.errors) console.error(validTranscript.errors);

      const report = scoreSession(transcript, card, loadRubric());
      expect(validReport(report)).toBe(true);
      if (validReport.errors) console.error(validReport.errors);

      // AC1 in-shape: every anchor names a real turn
      const turnIds = new Set(transcript.turns.map(t => t.turn_id));
      for (const dim of report.dimensions) {
        for (const anchor of dim.anchors) {
          expect(turnIds.has(anchor)).toBe(true);
        }
      }
    });
  },
);
