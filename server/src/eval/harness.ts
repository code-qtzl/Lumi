/**
 * Eval harness — runs the scorer over the labeled set and reports agreement.
 *
 * From roadmap: "Eval harness — scorer over labeled set → agreement (±1)
 * and per-dimension precision/recall"
 */

import { labeledSet, LabeledExample } from './labeled-set';
import { scoreSession } from './scorer';
import { checkAnchorValidity } from './anchor-checker';
import { loadRubric } from './rubric-loader';

export interface EvalResult {
  total: number;
  passed: number;
  agreement_pct: number;
  by_dimension: Record<string, DimensionEval>;
  by_tag: Record<string, TagEval>;
  anchor_validity: { valid: number; invalid: number };
  details: ExampleEvalResult[];
}

export interface DimensionEval {
  total: number;
  within_one: number;
  exact: number;
  agreement_pct: number;
  exact_pct: number;
  /**
   * Failure detection treated as binary (score ≤ 2 = failing technique).
   * The labeled set is deliberately failure-heavy, so raw agreement alone
   * flatters — precision/recall show whether the scorer actually catches
   * bad technique vs. rubber-stamping (lumi-eval-plan.md, L2).
   * null when the set contains no reference failures/flags for the dimension.
   */
  precision: number | null;
  recall: number | null;
}

export interface TagEval {
  total: number;
  avg_score_diff: number;
  agreement_pct: number;
}

export interface ExampleEvalResult {
  id: string;
  tags: string[];
  anchor_valid: boolean;
  dimensions: Array<{
    dimension_id: string;
    predicted: number;
    reference: number;
    diff: number;
    within_one: boolean;
  }>;
  decision_match: boolean;
  avg_diff: number;
}

/**
 * Run the full eval suite.
 */
export function runEval(): EvalResult {
  const rubric = loadRubric();
  const results: ExampleEvalResult[] = [];
  let totalPassed = 0;

  const byDimension: Record<string, { total: number; within_one: number; exact: number; tp: number; fp: number; fn: number }> = {};
  const byTag: Record<string, { total: number; diffs: number[] }> = {};
  let anchorValid = 0;
  let anchorInvalid = 0;

  for (const example of labeledSet) {
    const report = scoreSession(example.transcript, example.scenarioCard, rubric);
    const anchorResult = checkAnchorValidity(report, example.transcript);

    if (anchorResult.valid) anchorValid++;
    else anchorInvalid++;

    const dimResults: ExampleEvalResult['dimensions'] = [];
    let allWithinOne = true;
    let totalDiff = 0;

    for (const refDim of example.reference.dimensions) {
      const predicted = report.dimensions.find(d => d.dimension_id === refDim.dimension_id);
      const predScore = predicted?.score ?? 0;
      const diff = Math.abs(predScore - refDim.score);
      const withinOne = diff <= 1;

      dimResults.push({
        dimension_id: refDim.dimension_id,
        predicted: predScore,
        reference: refDim.score,
        diff,
        within_one: withinOne,
      });

      if (!withinOne) allWithinOne = false;
      totalDiff += diff;

      // Aggregate by dimension
      if (!byDimension[refDim.dimension_id]) {
        byDimension[refDim.dimension_id] = { total: 0, within_one: 0, exact: 0, tp: 0, fp: 0, fn: 0 };
      }
      const agg = byDimension[refDim.dimension_id];
      agg.total++;
      if (withinOne) agg.within_one++;
      if (diff === 0) agg.exact++;

      // Binary failure detection: score ≤ 2 = failing technique flagged
      const refFail = refDim.score <= 2;
      const predFail = predScore <= 2;
      if (refFail && predFail) agg.tp++;
      else if (!refFail && predFail) agg.fp++;
      else if (refFail && !predFail) agg.fn++;
    }

    const decisionMatch = report.decision_outcome.appropriate === example.reference.decision_outcome.appropriate;
    if (allWithinOne && decisionMatch) totalPassed++;

    // Aggregate by tag
    for (const tag of example.tags) {
      if (!byTag[tag]) byTag[tag] = { total: 0, diffs: [] };
      byTag[tag].total++;
      byTag[tag].diffs.push(totalDiff / example.reference.dimensions.length);
    }

    results.push({
      id: example.id,
      tags: example.tags,
      anchor_valid: anchorResult.valid,
      dimensions: dimResults,
      decision_match: decisionMatch,
      avg_diff: totalDiff / example.reference.dimensions.length,
    });
  }

  // Build dimension summaries
  const byDimensionSummary: Record<string, DimensionEval> = {};
  for (const [dimId, data] of Object.entries(byDimension)) {
    byDimensionSummary[dimId] = {
      total: data.total,
      within_one: data.within_one,
      exact: data.exact,
      agreement_pct: Math.round((data.within_one / data.total) * 100),
      exact_pct: Math.round((data.exact / data.total) * 100),
      precision: data.tp + data.fp > 0 ? Math.round((data.tp / (data.tp + data.fp)) * 100) / 100 : null,
      recall: data.tp + data.fn > 0 ? Math.round((data.tp / (data.tp + data.fn)) * 100) / 100 : null,
    };
  }

  // Build tag summaries
  const byTagSummary: Record<string, TagEval> = {};
  for (const [tag, data] of Object.entries(byTag)) {
    const avgDiff = data.diffs.reduce((s, d) => s + d, 0) / data.diffs.length;
    const agreementCount = results.filter(r => r.tags.includes(tag) && r.dimensions.every(d => d.within_one)).length;
    byTagSummary[tag] = {
      total: data.total,
      avg_score_diff: Math.round(avgDiff * 100) / 100,
      agreement_pct: Math.round((agreementCount / data.total) * 100),
    };
  }

  return {
    total: labeledSet.length,
    passed: totalPassed,
    agreement_pct: Math.round((totalPassed / labeledSet.length) * 100),
    by_dimension: byDimensionSummary,
    by_tag: byTagSummary,
    anchor_validity: { valid: anchorValid, invalid: anchorInvalid },
    details: results,
  };
}

/**
 * Print a human-readable eval summary.
 */
export function printEvalSummary(result: EvalResult): void {
  console.log('\n═══════════════════════════════════════════');
  console.log('  EVAL RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log(`  Total examples:     ${result.total}`);
  console.log(`  Passed (all dims ±1 + decision): ${result.passed}/${result.total}`);
  console.log(`  Agreement rate:     ${result.agreement_pct}%`);
  console.log(`  Anchor validity:    ${result.anchor_validity.valid} valid, ${result.anchor_validity.invalid} invalid`);
  console.log('───────────────────────────────────────────');
  console.log('  By dimension (P/R = failure detection, ref/pred score ≤2):');
  for (const [dimId, data] of Object.entries(result.by_dimension)) {
    const p = data.precision === null ? ' n/a' : data.precision.toFixed(2);
    const r = data.recall === null ? ' n/a' : data.recall.toFixed(2);
    console.log(`    ${dimId.padEnd(30)} ${data.within_one}/${data.total} within ±1 (${data.agreement_pct}%)  exact: ${data.exact}/${data.total} (${data.exact_pct}%)  P: ${p}  R: ${r}`);
  }
  console.log('───────────────────────────────────────────');
  console.log('  By tag:');
  for (const [tag, data] of Object.entries(result.by_tag)) {
    console.log(`    ${tag.padEnd(25)} ${data.agreement_pct}% agreement  avg diff: ${data.avg_score_diff}`);
  }
  console.log('───────────────────────────────────────────');
  console.log('  Detail:');
  for (const detail of result.details) {
    const status = detail.dimensions.every(d => d.within_one) && detail.decision_match ? '✓' : '✗';
    const dims = detail.dimensions.map(d => `${d.dimension_id}=${d.predicted}(ref:${d.reference})`).join(', ');
    console.log(`    ${status} ${detail.id.padEnd(30)} [${detail.tags.join(', ')}]  ${dims}`);
  }
  console.log('═══════════════════════════════════════════\n');
}