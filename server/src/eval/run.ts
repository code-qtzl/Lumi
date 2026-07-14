/**
 * Eval CLI — `npm run eval` from server/.
 *
 * Runs the scorer over the labeled set and prints agreement + anchor validity.
 * Exit code is non-zero only on anchor-validity failures (AC1: must be 100%).
 * Agreement is reported, not enforced — it's the number we iterate on.
 */

import { runEval, printEvalSummary } from './harness';

const result = runEval();
printEvalSummary(result);

console.log(
  '  Caveat: scorer v1 is rule-based and shares question heuristics with the\n' +
  '  fixture traveler, and the labeled set was authored by the same hand —\n' +
  '  agreement here is a scaffolding check, not evidence of scorer quality.\n' +
  '  Real agreement numbers come from scoring transcripts the heuristics\n' +
  '  did not generate (roadmap: calibration pass, step 9).\n'
);

if (result.anchor_validity.invalid > 0) {
  console.error(`[eval] FAIL: ${result.anchor_validity.invalid} report(s) with invalid anchors (AC1 requires 100%).`);
  process.exit(1);
}
if (result.modeled_alternatives.compliant < result.modeled_alternatives.required) {
  console.error(`[eval] FAIL: ${result.modeled_alternatives.required - result.modeled_alternatives.compliant} report(s) missing modeled alternatives on ≤3 dimensions (AC5).`);
  process.exit(1);
}
