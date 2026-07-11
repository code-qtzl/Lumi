/**
 * Traveler selection: real LLM when GEMINI_API_KEY is set, fixture otherwise
 * (F7: the app is fully runnable with no keys; fixture is the $0 dev loop).
 */

import { TravelerEngine } from './types';
import { fixtureTraveler } from './fixture';
import { createGeminiTraveler } from './gemini';

let traveler: TravelerEngine | null = null;

export function getTraveler(): TravelerEngine {
  if (traveler) return traveler;

  const apiKey = process.env.GEMINI_API_KEY;
  traveler = apiKey ? createGeminiTraveler(apiKey) : fixtureTraveler;
  console.log(`[traveler] engine: ${traveler.name}`);
  return traveler;
}

/** Test/probe hook: force a specific engine. */
export function setTraveler(engine: TravelerEngine | null): void {
  traveler = engine;
}
