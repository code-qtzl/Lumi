/**
 * Scenario registry — loads scenario cards from the shared contracts examples.
 *
 * In production this would load from a database or config;
 * for v1 it reads the example JSON cards.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ScenarioCard } from '../contracts';

const SCENARIO_DIR = path.join(__dirname, '..', '..', '..', 'shared', 'contracts', 'examples');

const loadedCards = new Map<string, ScenarioCard>();

/**
 * Load all example scenario cards from the shared contracts directory.
 * Any file named scenario-card*.json is treated as a card.
 */
export function loadScenarioCards(): Map<string, ScenarioCard> {
  if (loadedCards.size > 0) return loadedCards;

  let files: string[] = [];
  try {
    files = fs.readdirSync(SCENARIO_DIR).filter(f => f.startsWith('scenario-card') && f.endsWith('.json'));
  } catch (err) {
    console.warn(`[scenarios] Could not read ${SCENARIO_DIR}:`, err);
    return loadedCards;
  }

  for (const file of files) {
    const cardPath = path.join(SCENARIO_DIR, file);
    try {
      const raw = fs.readFileSync(cardPath, 'utf-8');
      const card = JSON.parse(raw) as ScenarioCard;
      loadedCards.set(card.scenario_id, card);
      console.log(`[scenarios] Loaded: ${card.scenario_id} — ${card.title}`);
    } catch (err) {
      console.warn(`[scenarios] Could not load ${cardPath}:`, err);
    }
  }

  return loadedCards;
}

/**
 * Get a single scenario card by ID.
 */
export function getScenarioCard(scenarioId: string): ScenarioCard | undefined {
  if (loadedCards.size === 0) loadScenarioCards();
  return loadedCards.get(scenarioId);
}

/**
 * List all available scenarios (trainee-safe summary fields only).
 */
export function listScenarios(): Array<{ scenario_id: string; title: string; difficulty?: number }> {
  if (loadedCards.size === 0) loadScenarioCards();
  return Array.from(loadedCards.entries()).map(([id, card]) => ({
    scenario_id: id,
    title: card.title,
    difficulty: card.difficulty,
  }));
}

/**
 * Add a card at runtime (authoring/CRUD). Caller is responsible for
 * validating against shared/contracts/scenario-card.schema.json first.
 * The registry is the ONLY scenario store — sessions and CRUD share it.
 */
export function addScenarioCard(card: ScenarioCard): void {
  if (loadedCards.size === 0) loadScenarioCards();
  loadedCards.set(card.scenario_id, card);
}

/** Remove a card at runtime. Returns false if it didn't exist. */
export function deleteScenarioCard(scenarioId: string): boolean {
  if (loadedCards.size === 0) loadScenarioCards();
  return loadedCards.delete(scenarioId);
}

/** Reset to the on-disk example cards. Call in test beforeEach. */
export function __resetForTesting(): void {
  loadedCards.clear();
  loadScenarioCards();
}