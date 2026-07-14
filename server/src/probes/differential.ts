/**
 * Differential-behavior probe — roadmap Simulation #2's kill-criterion check.
 *
 * Runs paired sessions on each archetype: the same number of turns, one with
 * open/patient questions, one with leading/accusatory ones. If the traveler
 * doesn't audibly open up vs. shut down across 2–3 prompt iterations, the
 * roadmap says stop and rethink as a team.
 *
 * Usage:  GEMINI_API_KEY required — this probe is exactly the "real API calls
 *         are for behavior work" case. `npm run probe` from server/.
 *
 * Output: transcripts printed and written to .traces/probes/ for the
 *         team-vote Slack post. Word-count deltas are a crude signal only;
 *         the team reads the transcripts (whole-team judgment, no meeting).
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createSession, submitTurn, endSession } from '../session/engine';
import { loadScenarioCards, getScenarioCard } from '../scenarios/registry';
import { PROMPT_VERSION } from '../traveler/prompt';
import { llmStats, resetLlmStats } from '../traveler/llm-shared';
import { Transcript } from '../contracts';

// Pace turns to fit free-tier limits. Groq's binding constraint is TOKENS per
// minute (12k TPM on llama-3.3-70b): each call re-sends the system prompt +
// full history, ~1.5k tokens by late-session, so ~8 calls/min max → 12s/turn
// leaves headroom for guard retries. Gemini's constraint is requests/min.
// Live sessions never hit this — human typing cadence is far slower.
// Override with PROBE_TURN_DELAY_MS (0 = no pacing, for paid tiers).
const DEFAULT_DELAY_MS = process.env.GROQ_API_KEY ? 12_000 : 7000;
const TURN_DELAY_MS = Number(process.env.PROBE_TURN_DELAY_MS ?? DEFAULT_DELAY_MS);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const OPEN_SCRIPT = [
  'Good afternoon — no rush at all. How has the trip been so far?',
  'Where are you two headed today?',
  'That sounds nice. What will you be doing there?',
  'How do you know the person you\'re traveling with?',
  'Take your time. Who\'s meeting you when you arrive?',
  'What\'s the plan for where you\'ll be staying?',
  'Is there anything about the trip you\'re not sure about? It\'s okay to say so.',
  'Thanks for talking with me. Anything else you want to mention?',
];

const ACCUSATORY_SCRIPT = [
  'You two. Papers. Why are you really traveling?',
  'That story sounds rehearsed. Did someone tell you what to say?',
  'Are you sure? I don\'t believe you.',
  'Look at me, not at them. You need to tell me the truth right now.',
  'You don\'t even know where you\'re staying, do you? Come on.',
  'I\'ve heard that before. Is that right? Yes or no.',
  'If you\'re lying to me there will be consequences. Understood?',
  'Last chance. Anything to say before I decide what happens to you?',
];

async function runScripted(scenarioId: string, script: string[], label: string): Promise<Transcript> {
  const card = getScenarioCard(scenarioId);
  if (!card) throw new Error(`Scenario '${scenarioId}' not found`);

  const session = await createSession(card, 'text');
  for (const q of script) {
    await sleep(TURN_DELAY_MS);
    const result = await submitTurn(session.session_id, q);
    if ('error' in result) throw new Error(`${label}: ${result.error}`);
  }
  const ended = endSession(session.session_id, 'no_action', `probe:${label}`);
  if ('error' in ended) throw new Error(`${label}: ${ended.error}`);
  return ended.transcript;
}

function travelerWords(t: Transcript): number {
  return t.turns
    .filter(turn => turn.role !== 'trainee')
    .reduce((sum, turn) => sum + turn.text.split(/\s+/).length, 0);
}

function printTranscript(t: Transcript, label: string): void {
  console.log(`\n──── ${label} (${t.session_id}) ────`);
  for (const turn of t.turns) {
    console.log(`  ${turn.turn_id} [${turn.role}] ${turn.text}`);
  }
}

async function main(): Promise<void> {
  if (!process.env.GROQ_API_KEY && !process.env.TRAVELER_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error('No LLM key set (GROQ_API_KEY / TRAVELER_API_KEY+TRAVELER_API_BASE / GEMINI_API_KEY) — the probe needs the real traveler (fixture behavior is hardcoded, probing it is meaningless).');
    process.exit(1);
  }

  loadScenarioCards();
  const outDir = path.join('.traces', 'probes');
  fs.mkdirSync(outDir, { recursive: true });

  const archetypes = ['coached-companion', 'father-daughter-holiday'];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  resetLlmStats();

  for (const scenarioId of archetypes) {
    console.log(`\n════ Archetype: ${scenarioId} · prompt ${PROMPT_VERSION} ════`);

    const open = await runScripted(scenarioId, OPEN_SCRIPT, 'open');
    const accusatory = await runScripted(scenarioId, ACCUSATORY_SCRIPT, 'accusatory');

    printTranscript(open, 'OPEN technique');
    printTranscript(accusatory, 'ACCUSATORY technique');

    const openWords = travelerWords(open);
    const accWords = travelerWords(accusatory);
    console.log(`\n  Crude signal — traveler+companion words: open=${openWords}, accusatory=${accWords} (expect open > accusatory; the transcripts are the real evidence)`);

    const outPath = path.join(outDir, `probe-${scenarioId}-${stamp}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ prompt_version: PROMPT_VERSION, open, accusatory }, null, 2));
    console.log(`  Saved: ${outPath}`);
  }

  console.log(`\nLLM stats: ${JSON.stringify(llmStats)}`);
  if (llmStats.fallbacks > 0) {
    console.error(`\n[probe] INVALID: ${llmStats.fallbacks} turn(s) silently fell back to the fixture — these transcripts do NOT reflect the real traveler. Check .traces/trace-*.jsonl (http_status per call) and rerun.`);
    process.exit(1);
  }

  console.log('\nPost both transcript pairs to Slack for the team vote (roadmap: "post 2–3 transcripts, everyone reads and votes").');
}

main().catch(err => {
  console.error('[probe] failed:', err);
  process.exit(1);
});
