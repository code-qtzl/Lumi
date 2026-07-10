/**
 * Fixture traveler — produces canned replies from the scenario card.
 *
 * Used for dev, testing, and demo fallback (F7 in PRD), and as the safe
 * per-turn fallback when the LLM traveler errors.
 */

import { ScenarioCard, Turn } from '../contracts';
import { TravelerEngine } from './types';

/** TravelerEngine wrapper — the engine consumes travelers only via this seam. */
export const fixtureTraveler: TravelerEngine = {
  name: 'fixture',
  reply: async (card, turns) => [{ role: 'traveler', text: getTravelerReply(card, turns) }],
};

/**
 * Returns a fixture reply for the traveler given the current conversation context.
 *
 * The reply is derived from the scenario card's persona and role-play instructions,
 * with simple heuristics based on the most recent trainee turn.
 */
export function getTravelerReply(card: ScenarioCard, turns: Turn[]): string {
  const lastTraineeTurn = [...turns].reverse().find(t => t.role === 'trainee');
  const traineeTurns = turns.filter(t => t.role === 'trainee');

  // Opening turn
  if (!lastTraineeTurn) {
    return getOpeningLine(card);
  }

  const lastText = lastTraineeTurn.text.toLowerCase();

  // Heuristic: detection of leading / accusatory questions
  const isAccusatory =
    /really\?|are you sure|tell me the truth|is that (right|true)|come on|i don't believe/i.test(lastText) ||
    /\byou (sure|can tell me|need to tell)\b/i.test(lastText);

  // Heuristic: detection of open / invitational questions
  const isOpen =
    /^how|^what|^where|^tell me|^describe|can you tell (me|us)|would you|mind (sharing|telling)/i.test(lastText) ||
    /\b(?:how was|what brought|where are you)\b/i.test(lastText);

  // Companion turn trigger — for scenarios with traveling_with
  if (card.persona.traveling_with && traineeTurns.length === 2 && !isOpen && !isAccusatory) {
    return `(${card.persona.name} glances at ${card.persona.traveling_with}) ${getGenericReply(card, 'neutral')}`;
  }

  if (isAccusatory) {
    return getAccusatoryReply(card);
  }

  if (isOpen) {
    return getOpenReply(card);
  }

  return getGenericReply(card, 'neutral');
}

function getOpeningLine(card: ScenarioCard): string {
  const name = card.persona.name;
  const withStr = card.persona.traveling_with ? ` with ${card.persona.traveling_with}` : '';

  if (card.ground_truth.type === 'innocent') {
    return `Hi. I'm ${name}${withStr}. We're just trying to make our connection. Is there a problem?`;
  }

  // Trafficking scenario — more guarded
  return `Hi. ${name}${withStr ? ` — ${withStr}` : ''}. We have a flight. Is everything okay?`;
}

function getOpenReply(card: ScenarioCard): string {
  if (card.ground_truth.type === 'innocent') {
    return `Yeah, we're headed to visit family. ${card.persona.traveling_with ? `I'm with ${card.persona.traveling_with} — we're` : "I'm"} really looking forward to it. It's been a long day though.`;
  }
  // Trafficking — rehearsed, avoids detail
  return `Just visiting. ${card.persona.traveling_with ? 'We\'re going together.' : ''} Can you just check us in? I don't want to miss the flight.`;
}

function getAccusatoryReply(card: ScenarioCard): string {
  if (card.ground_truth.type === 'innocent') {
    return `What? Why would you say that? Of course ${card.persona.traveling_with || 'that\'s who I am'}. This is ridiculous.`;
  }
  // Trafficking — fear + rehearsed story
  return `I told you, we're just traveling. Everything's fine. Can we please just go?`;
}

function getGenericReply(card: ScenarioCard, _tone: string): string {
  if (card.ground_truth.type === 'innocent') {
    return `I already told you. ${card.persona.traveling_with ? 'My ' + card.persona.traveling_with + ' is right there.' : ''} Can we just get through?`;
  }
  return `Look, everything's in order. The tickets are paid for. We just want to board our flight.`;
}