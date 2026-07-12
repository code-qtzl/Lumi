/**
 * Traveler selection — priority: OpenAI → Gemini → fixture.
 * The app is fully runnable with no keys; fixture is the $0 dev loop (F7).
 */

import { TravelerEngine } from './types';
import { fixtureTraveler } from './fixture';
import { createGeminiTraveler } from './gemini';
import { createOpenAITraveler } from './openai';

let traveler: TravelerEngine | null = null;

export function getTraveler(): TravelerEngine {
  if (traveler) return traveler;

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openaiKey) {
    traveler = createOpenAITraveler(openaiKey);
  } else if (geminiKey) {
    traveler = createGeminiTraveler(geminiKey);
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
