/**
 * Variation-invariance assertions (lumi-eval-plan.md L1): surface may vary,
 * ground truth may not.
 */

import { checkInvariance } from '../variations/invariance';
import { loadScenarioCards, getScenarioCard } from '../scenarios/registry';
import { ScenarioCard } from '../contracts';

beforeAll(() => loadScenarioCards());

function variantOf(parent: ScenarioCard, overrides: Partial<ScenarioCard>): ScenarioCard {
  return JSON.parse(JSON.stringify({ ...parent, ...overrides }));
}

describe('checkInvariance', () => {
  it('accepts a surface-only variant (names/route/presentation changed)', () => {
    const parent = getScenarioCard('coached-companion')!;
    const variant = variantOf(parent, {
      scenario_id: 'coached-companion-v2',
      title: 'Young man with older cousin, rehearsed answers',
      persona: { ...parent.persona, name: 'Andrei', traveling_with: 'an older cousin' },
      emotional_presentation: { label: 'frightened', voice_direction: 'quiet, hesitant' },
    });
    expect(checkInvariance(parent, variant)).toEqual({ valid: true, violations: [] });
  });

  it('rejects a variant that flips the ground truth type', () => {
    const parent = getScenarioCard('coached-companion')!;
    const variant = variantOf(parent, {
      scenario_id: 'coached-companion-v3',
      ground_truth: { ...parent.ground_truth, type: 'innocent' },
    });
    const result = checkInvariance(parent, variant);
    expect(result.valid).toBe(false);
    expect(result.violations.join(' ')).toMatch(/type changed/);
  });

  it('rejects added or dropped indicators', () => {
    const parent = getScenarioCard('coached-companion')!;
    const variant = variantOf(parent, {
      scenario_id: 'coached-companion-v4',
      ground_truth: { ...parent.ground_truth, indicators_present: parent.ground_truth.indicators_present.slice(1) },
    });
    expect(checkInvariance(parent, variant).valid).toBe(false);
  });

  it('rejects a variant reusing the parent id', () => {
    const parent = getScenarioCard('father-daughter-holiday')!;
    expect(checkInvariance(parent, variantOf(parent, {})).valid).toBe(false);
  });
});
