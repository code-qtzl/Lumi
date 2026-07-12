/**
 * Traveler selection (F7: fixture is the $0 default; the app runs keyless).
 *
 * Priority:
 *   1. GROQ_API_KEY            — Groq free tier, Llama-70B-class (recommended dev loop)
 *   2. TRAVELER_API_KEY + TRAVELER_API_BASE — any OpenAI-compatible host (e.g. Cerebras)
 *   3. GEMINI_API_KEY          — Gemini (free-tier rate limits are tight)
 *   4. none                    — fixture
 */

import { TravelerEngine } from './types';
import { fixtureTraveler } from './fixture';
import { createGeminiTraveler } from './gemini';
import { createOpenAiCompatTraveler } from './openai-compat';

let traveler: TravelerEngine | null = null;

export function getTraveler(): TravelerEngine {
  if (traveler) return traveler;

  const { GROQ_API_KEY, TRAVELER_API_KEY, TRAVELER_API_BASE, GEMINI_API_KEY, TRAVELER_MODEL } = process.env;

  if (GROQ_API_KEY) {
    traveler = createOpenAiCompatTraveler({
      apiBase: 'https://api.groq.com/openai/v1',
      apiKey: GROQ_API_KEY,
      model: TRAVELER_MODEL || 'llama-3.3-70b-versatile',
      label: 'groq',
    });
  } else if (TRAVELER_API_KEY && TRAVELER_API_BASE) {
    traveler = createOpenAiCompatTraveler({
      apiBase: TRAVELER_API_BASE,
      apiKey: TRAVELER_API_KEY,
      model: TRAVELER_MODEL || 'llama-3.3-70b',
      label: 'openai-compat',
    });
  } else if (GEMINI_API_KEY) {
    traveler = createGeminiTraveler(GEMINI_API_KEY);
  } else {
    traveler = fixtureTraveler;
  }

  console.log(`[traveler] engine: ${traveler.name}`);
  return traveler;
}

/** Test/probe hook: force a specific engine. */
export function setTraveler(engine: TravelerEngine | null): void {
  traveler = engine;
}
