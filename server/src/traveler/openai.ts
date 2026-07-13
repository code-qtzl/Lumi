/**
 * OpenAI traveler — GPT via the shared OpenAI-compatible engine.
 *
 * Model pinned via OPENAI_MODEL (default gpt-4o-mini). All behavior —
 * roleplay-v1 prompt, never-reveal guard with corrective retry, 429 retry,
 * fixture fallback so the session always survives — lives in
 * openai-compat.ts, shared with the Groq/Cerebras lane; this file is just
 * the provider config.
 */

import { TravelerEngine } from './types';
import { createOpenAiCompatTraveler } from './openai-compat';

export function createOpenAITraveler(apiKey: string): TravelerEngine {
  return createOpenAiCompatTraveler({
    apiBase: 'https://api.openai.com/v1',
    apiKey,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    label: 'openai',
  });
}
