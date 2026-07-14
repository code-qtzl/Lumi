/**
 * Variation generator (F3/AC3) — `npm run variations` from server/.
 *
 * Given an archetype card, the LLM generates SURFACE variation only:
 * title, persona (names, relationship, backstory wording), role-play
 * instructions phrasing, emotional presentation (incl. coached/frightened/
 * flat for the trafficking archetype), and a reveal summary rewritten for
 * the new surface. Ground truth is never up to the model: `type` and
 * `indicators_present` are copied from the parent programmatically, and
 * teaching_points are copied verbatim (the pedagogy is the invariant).
 *
 * Every candidate must pass BOTH gates before it is written:
 *   1. shared/contracts/scenario-card.schema.json (ajv)
 *   2. checkInvariance(parent, variant)
 *
 * Accepted variants land in shared/contracts/examples/ as
 * scenario-card.<id>.gen.json — the registry auto-loads them, so blind
 * session assignment immediately draws from the whole pool (U5: replay
 * without memorizing). validate.py validates them like any other card.
 *
 * Safety (PRD NFR): the prompt forbids demographic/protected attributes as
 * variation axes. Read every generated card before shipping — the gates
 * catch structure, humans catch tone.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import { ScenarioCard } from '../contracts';
import { checkInvariance } from './invariance';
import { loadScenarioCards, getScenarioCard } from '../scenarios/registry';

const CONTRACTS_DIR = path.join(__dirname, '..', '..', '..', 'shared', 'contracts');
const EXAMPLES_DIR = path.join(CONTRACTS_DIR, 'examples');
const TARGET_PER_ARCHETYPE = Number(process.env.VARIANTS_PER_ARCHETYPE ?? 8);
const VARIANTS_PER_CALL = 4;
const MAX_CALLS_PER_ARCHETYPE = 8;
const CALL_DELAY_MS = Number(process.env.PROBE_TURN_DELAY_MS ?? (process.env.GROQ_API_KEY ? 15_000 : 2000));

const ajv = new Ajv2020({ allErrors: true });
const validateCard = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'scenario-card.schema.json'), 'utf-8')),
);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Minimal completion client over the same env-based provider strategy ──────

function resolveProvider(): { base: string; key: string; model: string; label: string } | null {
  const env = process.env;
  if (env.GROQ_API_KEY) {
    return { base: 'https://api.groq.com/openai/v1', key: env.GROQ_API_KEY, model: env.TRAVELER_MODEL || 'llama-3.3-70b-versatile', label: 'groq' };
  }
  if (env.OLLAMA_MODEL) {
    return { base: env.OLLAMA_BASE_URL || 'http://localhost:11434/v1', key: 'ollama', model: env.OLLAMA_MODEL, label: 'ollama' };
  }
  if (env.OPENAI_API_KEY) {
    return { base: 'https://api.openai.com/v1', key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-4o-mini', label: 'openai' };
  }
  if (env.TRAVELER_API_KEY && env.TRAVELER_API_BASE) {
    return { base: env.TRAVELER_API_BASE, key: env.TRAVELER_API_KEY, model: env.TRAVELER_MODEL || 'llama-3.3-70b', label: 'openai-compat' };
  }
  return null;
}

async function complete(system: string, user: string): Promise<{ text: string | null; rateLimited: boolean }> {
  const p = resolveProvider()!;
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: 1.0,
      max_tokens: 3000,
    }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`  [llm] ${res.status}: ${JSON.stringify(json)?.slice(0, 160)}`);
    return { text: null, rateLimited: res.status === 429 };
  }
  return { text: json?.choices?.[0]?.message?.content ?? null, rateLimited: false };
}

/** Generated content must never name the ground truth — titles/labels are shown in the debrief and must describe behavior, not verdicts. */
const TITLE_LEAK = /\btraffick|victim|smuggl|abduct|exploit/i;

// ── Generation ────────────────────────────────────────────────────────────────

const SYSTEM = `You write surface variations of training-scenario cards for an anti-trafficking interview simulator. You vary ONLY the surface: names, relationship wording, route/background details, phrasing of behavior instructions, and the emotional presentation. You NEVER change what is actually going on in the scenario, and you NEVER use nationality, ethnicity, religion, or any demographic attribute as a signal of anything — personas are described by behavior and situation only. Reply with a single JSON object, no markdown fences.`;

interface SurfaceVariant {
  title: string;
  difficulty?: number;
  persona: { name: string; traveling_with: string; backstory: string };
  role_play_instructions: string;
  emotional_presentation: { label: string; voice_direction?: string };
  reveal_summary: string;
}

function buildUserPrompt(parent: ScenarioCard, n: number, presentations: string[]): string {
  return `Parent scenario (surface fields only):
${JSON.stringify({
    title: parent.title,
    persona: parent.persona,
    role_play_instructions: parent.role_play_instructions,
    emotional_presentation: parent.emotional_presentation,
    reveal_summary: parent.reveal.summary,
  }, null, 2)}

The hidden situation ("what is actually going on") must stay EXACTLY the same kind of situation — same behavioral dynamics, same pedagogical point — but everything on the surface changes: different names, different relationship wording (e.g. aunt/cousin/family friend/parent as appropriate to the same dynamic), different destination/route flavor, reworded behavior instructions, and a different emotional presentation drawn from: ${presentations.join(', ')}.

Produce ${n} variants as JSON:
{"variants":[{"title":"...","difficulty":1|2|3,"persona":{"name":"...","traveling_with":"...","backstory":"..."},"role_play_instructions":"...","emotional_presentation":{"label":"...","voice_direction":"..."},"reveal_summary":"..."}]}

Rules:
- backstory: 2–4 sentences, written for the role-play model, same underlying situation as the parent.
- role_play_instructions: how to behave, including how to react differently to open vs. accusatory questioning.
- reveal_summary: 1–3 sentences telling the trainee what was actually going on, using the NEW names.
- voice_direction: a short acting note.
- No demographic/protected attributes anywhere.`;
}

function assemble(parent: ScenarioCard, surface: SurfaceVariant, index: number): ScenarioCard {
  return {
    scenario_id: `${parent.scenario_id}-v${index}`,
    title: surface.title,
    difficulty: surface.difficulty ?? parent.difficulty,
    persona: surface.persona,
    role_play_instructions: surface.role_play_instructions,
    emotional_presentation: surface.emotional_presentation,
    // Ground truth is copied, never generated (F3 invariants)
    ground_truth: JSON.parse(JSON.stringify(parent.ground_truth)),
    reveal: {
      summary: surface.reveal_summary,
      teaching_points: [...parent.reveal.teaching_points],
    },
  };
}

async function generateForArchetype(parentId: string): Promise<number> {
  const parent = getScenarioCard(parentId);
  if (!parent) throw new Error(`Parent archetype '${parentId}' not found`);

  const presentations = parent.ground_truth.type === 'trafficking'
    ? ['coached (rehearsed story, deference)', 'frightened', 'flat/withdrawn']
    : ['ordinary-nervous', 'tired/irritable', 'chatty/oblivious'];

  // Resume-aware: existing accepted variants count toward the target and
  // numbering continues after them (reruns top up instead of regenerating).
  const existing = fs.readdirSync(EXAMPLES_DIR)
    .map(f => f.match(new RegExp(`^scenario-card\\.${parentId}-v(\\d+)\\.gen\\.json$`)))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(m => Number(m[1]));
  let accepted = existing.length;
  let index = existing.length > 0 ? Math.max(...existing) + 1 : 1;

  console.log(`\n━━ ${parentId} (${parent.ground_truth.type}) → target ${TARGET_PER_ARCHETYPE} variants (${accepted} already on disk)`);

  let calls = 0;
  while (accepted < TARGET_PER_ARCHETYPE && calls < MAX_CALLS_PER_ARCHETYPE) {
    if (calls > 0) await sleep(CALL_DELAY_MS);
    calls++;
    const need = Math.min(VARIANTS_PER_CALL, TARGET_PER_ARCHETYPE - accepted);
    const { text: raw, rateLimited } = await complete(SYSTEM, buildUserPrompt(parent, need, presentations));
    if (rateLimited) {
      calls--; // a throttled call isn't an attempt — wait out the token window
      console.log('  … token-per-minute window exhausted, waiting 60s');
      await sleep(60_000);
      continue;
    }
    if (!raw) continue;

    let batch: SurfaceVariant[] = [];
    try {
      const parsed = JSON.parse(raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/, ''));
      batch = Array.isArray(parsed) ? parsed : parsed.variants ?? [];
    } catch {
      console.warn('  ✗ batch unparseable, retrying');
      continue;
    }

    for (const surface of batch) {
      if (accepted >= TARGET_PER_ARCHETYPE) break;
      const variant = assemble(parent, surface, index);

      if (TITLE_LEAK.test(variant.title) || TITLE_LEAK.test(variant.emotional_presentation.label)) {
        console.warn(`  ✗ ${variant.scenario_id}: title/label names the ground truth ("${variant.title}")`);
        continue;
      }
      const schemaOk = validateCard(variant as unknown);
      if (!schemaOk) {
        console.warn(`  ✗ ${variant.scenario_id}: schema — ${ajv.errorsText(validateCard.errors)?.slice(0, 120)}`);
        continue;
      }
      const inv = checkInvariance(parent, variant);
      if (!inv.valid) {
        console.warn(`  ✗ ${variant.scenario_id}: invariance — ${inv.violations.join('; ')}`);
        continue;
      }

      const outPath = path.join(EXAMPLES_DIR, `scenario-card.${variant.scenario_id}.gen.json`);
      fs.writeFileSync(outPath, JSON.stringify(variant, null, '\t') + '\n');
      console.log(`  ✓ ${variant.scenario_id} — "${variant.title}" [${variant.emotional_presentation.label}]`);
      accepted++;
      index++;
    }
  }

  if (accepted < TARGET_PER_ARCHETYPE) {
    console.error(`  Only ${accepted}/${TARGET_PER_ARCHETYPE} accepted after ${calls} calls.`);
  }
  return accepted;
}

async function main(): Promise<void> {
  if (!resolveProvider()) {
    console.error('No LLM configured (GROQ_API_KEY / OLLAMA_MODEL / OPENAI_API_KEY / TRAVELER_API_*) — the generator needs a real model.');
    process.exit(1);
  }

  loadScenarioCards();
  const parents = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['coached-companion', 'father-daughter-holiday'];

  let total = 0;
  for (const id of parents) {
    total += await generateForArchetype(id);
  }

  console.log(`\n${total} variant(s) written to shared/contracts/examples/ (*.gen.json).`);
  console.log('They load into the registry automatically — blind assignment now draws from the full pool.');
  console.log('Run `cd shared/contracts && python3 validate.py` and READ each card before shipping (AC3 + safety NFR).');
  const failed = parents.length * TARGET_PER_ARCHETYPE > total;
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('[variations] failed:', err);
  process.exit(1);
});
