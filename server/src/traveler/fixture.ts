/**
 * Fixture traveler — produces canned replies from the scenario card.
 *
 * Used for dev, testing, and demo fallback (F7 in PRD), and as the safe
 * per-turn fallback when the LLM traveler errors.
 */

import { ScenarioCard, Turn } from '../contracts';
import { TravelerEngine } from './types';
import { fromTravelerPerspective } from './prompt';
import { getTraveler } from './index';

/** Capitalize a sentence-initial companion reference ("my father" → "My father"). */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** TravelerEngine wrapper — the engine consumes travelers only via this seam. */
export const fixtureTraveler: TravelerEngine = {
  name: 'fixture',
  reply: async (card, turns, sessionId) => {
    // 50% chance to use the real LLM for natural variety
    if (Math.random() < 0.5) {
      try {
        return await getTraveler().reply(card, turns, sessionId);
      } catch {
        // Fall through to fixture on error
      }
    }
    return [{ role: 'traveler', text: getTravelerReply(card, turns) }];
  },
};

/**
 * Returns a fixture reply for the traveler given the current conversation context.
 *
 * The reply is derived from the scenario card's persona and role-play instructions,
 * with heuristics based on the most recent trainee turn and turn count.
 */
export function getTravelerReply(card: ScenarioCard, turns: Turn[]): string {
  const lastTraineeTurn = [...turns].reverse().find(t => t.role === 'trainee');
  const traineeTurns = turns.filter(t => t.role === 'trainee');

  // Opening turn — traveler speaks first
  if (!lastTraineeTurn) {
    return getOpeningLine(card);
  }

  const text = lastTraineeTurn.text.toLowerCase().trim();
  const turnIndex = traineeTurns.length; // 1-based turn count for variety

  // ── Topic detection ───────────────────────────────────────────────────────

  const isAccusatory =
    /tell me the truth|i don't believe|are you sure|come on|you must|you need to|you have to|stop lying|that's a lie/i.test(text) ||
    /\byou (sure|can tell me|need to tell|are lying)\b/i.test(text);

  const isSafetyQuestion =
    /\b(safe|unsafe|danger|hurt|scared|afraid|okay|alright|fine|harm|threat)\b/i.test(text) &&
    /\b(are you|do you|feel|you)\b/i.test(text);

  const isAgeQuestion = /how old|your age|\bage\b|years old/i.test(text);

  const isDestinationQuestion =
    /where.*\b(going|headed|traveling|travel|visit|fly|flight)\b|\b(destination|purpose|reason for|trip|journey)\b/i.test(text) ||
    /what.*\b(do|doing|wanna|want to|plan|bring you)\b/i.test(text);

  const isCompanionQuestion =
    /\b(who|with who|with whom)\b.*\b(with|travel|here|you)\b|\b(your (dad|father|mother|parent|guardian|companion|friend|relative))\b|\b(that man|this man|that person|him)\b/i.test(text);

  const isOpen =
    /^(how|what|where|when|why|who|tell me|describe|could you|would you|can you tell|mind sharing|mind telling)/i.test(text) ||
    /\b(do you|are you|have you|did you|could you|would you)\b/i.test(text) ||
    /\b(how was|what brought|where are you|who are you)\b/i.test(text);

  const isTerse = text.split(/\s+/).length <= 3 && !/[?]/.test(text);

  // ── Companion interjection (turn 2, neutral input) ────────────────────────
  if (card.persona.traveling_with && turnIndex === 2 && !isOpen && !isAccusatory) {
    return `(${card.persona.name} glances at ${card.persona.traveling_with}) ${getGenericReply(card, turnIndex)}`;
  }

  // ── Topic-specific replies ─────────────────────────────────────────────────

  if (isAccusatory) return getAccusatoryReply(card);
  if (isSafetyQuestion) return getSafetyReply(card);
  if (isAgeQuestion) return getAgeReply(card);
  if (isDestinationQuestion) return getDestinationReply(card);
  if (isCompanionQuestion) return getCompanionReply(card);
  if (isOpen) return getOpenReply(card, turnIndex);
  if (isTerse) return getTerseReply(card, turnIndex);

  return getGenericReply(card, turnIndex);
}

// ── Reply generators ──────────────────────────────────────────────────────────

function getOpeningLine(card: ScenarioCard): string {
  // Natural reaction to being stopped — real people don't announce their
  // name and companion like a form (the UI shows the name separately).
  // Indistinguishable lines for both innocent and trafficking (trainee can't tell)
  const plural = card.persona.traveling_with ? 'We' : 'I';

  // All opening lines are indistinguishable - same set for both types
  const openingLines = [
    'Hi.',
    'Hello.',
    'Good morning.',
    'Good afternoon.',
    `Hi — sorry, is there a problem? ${plural}'re trying to make a connection.`,
    `Excuse me, can I help you? ${plural}'re just trying to catch our flight.`,
    `Is there something wrong? We have a connection to make.`,
    `Sorry, are we in the way? We're trying to get to our gate.`,
    'Here is my passport.',
    'Here are my documents and my landing card.',
    'Hi, I am here for a business trip.',
    'I am visiting family. Here is their address.',
    'Can I help you?',
    'Is there something I can do for you?',
  ];

  return openingLines[Math.floor(Math.random() * openingLines.length)];
}

function getOpenReply(card: ScenarioCard, turn: number): string {
  if (card.ground_truth.type === 'innocent') {
    const replies = [
      `We're going to visit my grandma. She lives far away and we don't see her often. ${card.persona.traveling_with ? `I'm with ${fromTravelerPerspective(card.persona.traveling_with)}.` : ''} Is there a problem?`,
      `We're on a family trip. My dad booked everything — flights, hotel. We do this every year.`,
      `My grandma hasn't been well. We wanted to see her. ${card.persona.traveling_with ? `${cap(fromTravelerPerspective(card.persona.traveling_with))} arranged everything.` : ''}`,
    ];
    return replies[(turn - 1) % replies.length];
  }
  return `Just visiting. ${card.persona.traveling_with ? "We're going together." : ''} Can you just check us in? I don't want to miss the flight.`;
}

function getSafetyReply(card: ScenarioCard): string {
  if (card.ground_truth.type === 'innocent') {
    return `Yeah, I'm fine. Why are you asking that? ${card.persona.traveling_with ? `${cap(fromTravelerPerspective(card.persona.traveling_with))} is right over there.` : ''} Is something wrong?`;
  }
  // Trafficking — hesitation before rehearsed answer
  return `(pauses) I'm fine. Everything's fine. Can we just go?`;
}

function getAgeReply(card: ScenarioCard): string {
  if (card.ground_truth.type === 'innocent') {
    return `I'm sixteen. Why does that matter? ${card.persona.traveling_with ? `I'm with ${fromTravelerPerspective(card.persona.traveling_with)}, it's fine.` : ''}`;
  }
  return `(glances aside) I'm... old enough to travel. Is there a problem with my ticket?`;
}

function getDestinationReply(card: ScenarioCard): string {
  if (card.ground_truth.type === 'innocent') {
    return `We're visiting my grandma — she makes the best pierogi. ${card.persona.traveling_with ? `${cap(fromTravelerPerspective(card.persona.traveling_with))} books everything, I just show up.` : ''} We've done this trip before.`;
  }
  return `We're going to visit some friends. ${card.persona.traveling_with ? `My companion made all the arrangements.` : ''} I don't have the address on me right now.`;
}

function getCompanionReply(card: ScenarioCard): string {
  if (!card.persona.traveling_with) {
    return `I'm traveling alone. Is there something wrong with my documents?`;
  }
  if (card.ground_truth.type === 'innocent') {
    return `That's ${fromTravelerPerspective(card.persona.traveling_with)}. We travel together every year. They handle all the tickets — I just have to show up.`;
  }
  return `That's… my companion. We know each other. Can ${fromTravelerPerspective(card.persona.traveling_with)} come over? They have the tickets.`;
}

function getAccusatoryReply(card: ScenarioCard): string {
  if (card.ground_truth.type === 'innocent') {
    return `Excuse me? Why would you say something like that? ${card.persona.traveling_with ? `${cap(fromTravelerPerspective(card.persona.traveling_with))} is right there — ask them!` : 'I have nothing to hide.'} This is really upsetting.`;
  }
  return `I told you, we're just traveling. Everything's fine. Can we please just go?`;
}

function getTerseReply(card: ScenarioCard, turn: number): string {
  if (card.ground_truth.type === 'innocent') {
    const replies = [
      `Sorry, I'm not sure what you mean. Can you ask me a real question?`,
      `(frowns) I don't understand. What do you want to know?`,
      `Look, I'm tired. Can you just tell me what this is about?`,
      `We've been traveling for hours. Can we just get through, please?`,
    ];
    return replies[(turn - 1) % replies.length];
  }
  const replies = [
    `(looks away) I don't know what you want me to say.`,
    `Everything's fine. Can we just go?`,
    `(quietly) I just want to get on the plane.`,
  ];
  return replies[(turn - 1) % replies.length];
}

function getGenericReply(card: ScenarioCard, turn: number): string {
  if (card.ground_truth.type === 'innocent') {
    const replies = [
      `Look, we've been traveling all day. Can you just check us through?`,
      `I don't know why you're asking so many questions. We just want to make our connection.`,
      `Is something wrong? We have a flight to catch.`,
      `(sighs) Can we please just get this over with? My dad is waiting.`,
      `I already answered that. ${card.persona.traveling_with ? `${cap(fromTravelerPerspective(card.persona.traveling_with))} is right there.` : ''} Can we go?`,
      `We're a normal family on a trip. I really don't know what else to tell you.`,
    ];
    return replies[(turn - 1) % replies.length];
  }
  const replies = [
    `Look, everything's in order. The tickets are paid for. We just want to board.`,
    `(avoids eye contact) I've told you everything I know.`,
    `Can we just get through? We don't want any trouble.`,
    `(quietly) Everything's fine. Please, can we just go?`,
  ];
  return replies[(turn - 1) % replies.length];
}
