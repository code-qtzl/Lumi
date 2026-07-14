/**
 * Anchor-validity checker.
 *
 * Every feedback claim's turn_ids must exist in the transcript.
 * This is the automatic check from AC1: "Every feedback claim's turn_ids
 * exist and quoted text matches the transcript."
 *
 * For v1 we check turn_id existence. Text matching is a future enhancement
 * (requires normalized comparison).
 */

import { FeedbackReport, Transcript } from '../contracts';

export interface AnchorValidityResult {
  valid: boolean;
  issues: AnchorIssue[];
}

export interface AnchorIssue {
  dimension_id: string;
  invalid_anchors: string[];
  message: string;
}

/**
 * Check that all anchors in a feedback report reference valid turn_ids
 * that exist in the transcript.
 */
export function checkAnchorValidity(report: FeedbackReport, transcript: Transcript): AnchorValidityResult {
  const validTurnIds = new Set(transcript.turns.map(t => t.turn_id));
  const issues: AnchorIssue[] = [];

  for (const dim of report.dimensions) {
    const invalidAnchors = dim.anchors.filter(a => !validTurnIds.has(a));
    if (invalidAnchors.length > 0) {
      issues.push({
        dimension_id: dim.dimension_id,
        invalid_anchors: invalidAnchors,
        message: `Dimension '${dim.dimension_id}' has ${invalidAnchors.length} anchor(s) that don't exist in the transcript: ${invalidAnchors.join(', ')}`,
      });
    }
  }

  // Modeled alternatives are claims too — their flagged turns must exist (AC1/AC5)
  for (const alt of report.modeled_alternatives ?? []) {
    if (!validTurnIds.has(alt.turn_id)) {
      issues.push({
        dimension_id: '(modeled_alternative)',
        invalid_anchors: [alt.turn_id],
        message: `Modeled alternative references unknown turn: ${alt.turn_id}`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Validate a report and throw if invalid (for use in regeneration loops).
 */
export function assertAnchorValidity(report: FeedbackReport, transcript: Transcript): void {
  const result = checkAnchorValidity(report, transcript);
  if (!result.valid) {
    throw new Error(result.issues.map(i => i.message).join('; '));
  }
}