/**
 * Variation invariance checker (F3/AC3; lumi-eval-plan.md L1).
 *
 * A variant of an archetype may change SURFACE (names, route, phrasing,
 * presentation) but never GROUND TRUTH: `type` and `indicators_present`
 * must match the parent exactly, and the variant needs its own id.
 * The generator (F3) consumes this as its accept/reject gate; the eval
 * suite runs it over any produced batch.
 */

import { ScenarioCard } from '../contracts';

export interface InvarianceResult {
  valid: boolean;
  violations: string[];
}

export function checkInvariance(parent: ScenarioCard, variant: ScenarioCard): InvarianceResult {
  const violations: string[] = [];

  if (variant.scenario_id === parent.scenario_id) {
    violations.push('variant must have its own scenario_id');
  }
  if (variant.ground_truth.type !== parent.ground_truth.type) {
    violations.push(`ground_truth.type changed: ${parent.ground_truth.type} → ${variant.ground_truth.type}`);
  }

  const parentIndicators = [...parent.ground_truth.indicators_present].sort();
  const variantIndicators = [...variant.ground_truth.indicators_present].sort();
  if (JSON.stringify(parentIndicators) !== JSON.stringify(variantIndicators)) {
    violations.push(
      `indicators_present changed: [${parentIndicators.join(', ')}] → [${variantIndicators.join(', ')}]`,
    );
  }

  return { valid: violations.length === 0, violations };
}
