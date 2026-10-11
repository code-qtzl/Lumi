/**
 * Traveler selection (F7: fixture is the $0 default; the app runs keyless).
 *
 * Team cost strategy: Groq free tier for shared/live work, Ollama for
 * unlimited local iteration. Priority:
 *   1. GROQ_API_KEY            — Groq free tier, Llama-70B-class (recommended)
 *   2. OLLAMA_MODEL            — local Ollama ($0, offline; OLLAMA_BASE_URL to override)
 *   3. OPENAI_API_KEY          — OpenAI (paid; gpt-4o-mini default)
 *   4. TRAVELER_API_KEY + TRAVELER_API_BASE — any OpenAI-compatible host
 *   5. GEMINI_API_KEY          — Gemini (free-tier rate limits are tight)
 *   6. none                    — fixture
 */

import { TravelerEngine } from './types';
import { fixtureTraveler } from './fixture';
import { createGeminiTraveler } from './gemini';
import { createOpenAITraveler } from './openai';
import { createOpenAiCompatTraveler } from './openai-compat';

let traveler: TravelerEngine | null = null;
export function getTraveler(): TravelerEngine {
  if (traveler) return traveler;

  const { GROQ_API_KEY, OLLAMA_MODEL, OLLAMA_BASE_URL, OPENAI_API_KEY, TRAVELER_API_KEY, TRAVELER_API_BASE, GEMINI_API_KEY, TRAVELER_MODEL } = process.env;

  let modelTraveler: TravelerEngine | null = null;

  if (GROQ_API_KEY) {
    modelTraveler = createOpenAiCompatTraveler({
      apiBase: 'https://api.groq.com/openai/v1',
      apiKey: GROQ_API_KEY,
      model: TRAVELER_MODEL || 'llama-3.3-70b-versatile',
      label: 'groq',
    });
  } else if (OLLAMA_MODEL) {
    modelTraveler = createOpenAiCompatTraveler({
      apiBase: OLLAMA_BASE_URL || 'http://localhost:11434/v1',
      apiKey: 'ollama', // Ollama ignores auth; the header just needs to exist
      model: OLLAMA_MODEL,
      label: 'ollama',
    });
  } else if (OPENAI_API_KEY) {
    modelTraveler = createOpenAITraveler(OPENAI_API_KEY);
  } else if (TRAVELER_API_KEY && TRAVELER_API_BASE) {
    modelTraveler = createOpenAiCompatTraveler({
      apiBase: TRAVELER_API_BASE,
      apiKey: TRAVELER_API_KEY,
      model: TRAVELER_MODEL || 'llama-3.3-70b',
      label: 'openai-compat',
    });
  } else if (GEMINI_API_KEY) {
    modelTraveler = createGeminiTraveler(GEMINI_API_KEY);
  }

  // The model traveler IS the traveler when a key is configured. The fixture
  // is only the keyless engine (F7) — never mixed into live sessions
  // (a per-turn "fixture lane" produced canned, context-blind replies mid-
  // conversation; removed deliberately).
  traveler = modelTraveler ?? fixtureTraveler;

  console.log(`[traveler] engine: ${traveler.name}`);
  return traveler;
}

/**
 * Called at boot. A production deploy with no usable model key would
 * otherwise serve canned fixture replies as if they were the real traveler —
 * and score trainees on them. An empty secret (GROQ_API_KEY="") lands here
 * too. ALLOW_FIXTURE=1 opts in explicitly (e.g. smoke-testing the image).
 */
export function assertTravelerConfig(): void {
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_FIXTURE === '1') return;
  if (getTraveler() === fixtureTraveler) {
    throw new Error('No traveler model configured in production (is GROQ_API_KEY empty?). Set a model key, or ALLOW_FIXTURE=1 to serve canned replies.');
  }
}

/** Test/probe hook: force a specific engine. */
export function setTraveler(engine: TravelerEngine | null): void {
  traveler = engine;
}
