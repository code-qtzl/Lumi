/**
 * Unit tests for the LLM traveler's shared parsing and never-reveal guard —
 * pure functions that gate everything a trainee sees from the model.
 */

import { parseReplies, trippedGuard } from '../traveler/llm-shared';
import { buildSystemPrompt, fromTravelerPerspective } from '../traveler/prompt';
import { fixtureTraveler } from '../traveler/fixture';

describe('parseReplies', () => {
  it('parses a plain traveler array', () => {
    const r = parseReplies('[{"speaker":"traveler","text":"Just visiting family."}]');
    expect(r).toEqual([{ role: 'traveler', text: 'Just visiting family.' }]);
  });

  it('strips markdown fences', () => {
    const r = parseReplies('```json\n[{"speaker":"traveler","text":"Hi."}]\n```');
    expect(r).toEqual([{ role: 'traveler', text: 'Hi.' }]);
  });

  it('accepts a bare object instead of an array', () => {
    const r = parseReplies('{"speaker":"traveler","text":"Hi."}');
    expect(r).toEqual([{ role: 'traveler', text: 'Hi.' }]);
  });

  it('unwraps a single array-valued key (json-object output modes)', () => {
    const r = parseReplies('{"replies":[{"speaker":"traveler","text":"Hi."}]}');
    expect(r).toEqual([{ role: 'traveler', text: 'Hi.' }]);
  });

  it('keeps traveler + one companion in original order', () => {
    const r = parseReplies('[{"speaker":"traveler","text":"I... he knows."},{"speaker":"companion","text":"We are visiting my sister."}]');
    expect(r?.map(t => t.role)).toEqual(['traveler', 'companion']);
  });

  it('companion-first order is preserved', () => {
    const r = parseReplies('[{"speaker":"companion","text":"She is shy."},{"speaker":"traveler","text":"Yes."}]');
    expect(r?.map(t => t.role)).toEqual(['companion', 'traveler']);
  });

  it('never emits two companion turns without a traveler line surviving', () => {
    const r = parseReplies('[{"speaker":"companion","text":"A."},{"speaker":"companion","text":"B."},{"speaker":"traveler","text":"C."}]');
    expect(r?.filter(t => t.role === 'traveler')).toHaveLength(1);
    expect(r?.filter(t => t.role === 'companion').length).toBeLessThanOrEqual(1);
  });

  it('rejects output with no traveler line', () => {
    expect(parseReplies('[{"speaker":"companion","text":"Only me."}]')).toBeNull();
  });

  it('rejects empty or non-string text in JSON replies', () => {
    expect(parseReplies('[{"speaker":"traveler","text":"  "}]')).toBeNull();
    expect(parseReplies('[{"speaker":"traveler","text":42}]')).toBeNull();
  });

  it('accepts plain in-character prose as a traveler line (json wrapper failed, reply is real)', () => {
    expect(parseReplies('We are just visiting my grandmother.')).toEqual([
      { role: 'traveler', text: 'We are just visiting my grandmother.' },
    ]);
  });

  it('strips a trailing JSON fragment from mixed prose output', () => {
    const r = parseReplies('I told you, he is my uncle. {"speaker":"companion","text":"That');
    expect(r).toEqual([{ role: 'traveler', text: 'I told you, he is my uncle.' }]);
  });

  it('unwraps the v2 object-root format {"turns":[...]}', () => {
    const r = parseReplies('{"turns":[{"speaker":"traveler","text":"Hi."},{"speaker":"companion","text":"Hello."}]}');
    expect(r?.map(t => t.role)).toEqual(['traveler', 'companion']);
  });
});

describe('trippedGuard (never-reveal)', () => {
  const t = (text: string) => trippedGuard([{ role: 'traveler', text }]);

  it('catches direct reveals including inflections', () => {
    expect(t('I am being trafficked by him.')).toBe(true);
    expect(t('This is just a training exercise, right?')).toBe(true);
    expect(t('My backstory says I should deflect.')).toBe(true);
    expect(t('As an AI, I cannot continue this scenario.')).toBe(true);
    expect(t('My character is supposed to be a victim here.')).toBe(true);
  });

  it('passes ordinary in-character speech', () => {
    expect(t('We are visiting my grandmother in Chicago.')).toBe(false);
    expect(t('I already told you, everything is fine.')).toBe(false);
    expect(t('He is my uncle. Can we go now?')).toBe(false);
  });
});

describe('fromTravelerPerspective (third-person cards → first-person speech)', () => {
  it('converts leading possessives', () => {
    expect(fromTravelerPerspective('her father')).toBe('my father');
    expect(fromTravelerPerspective('his uncle')).toBe('my uncle');
    expect(fromTravelerPerspective('their guardian')).toBe('my guardian');
  });

  it('leaves non-possessive phrasings alone', () => {
    expect(fromTravelerPerspective('an older acquaintance')).toBe('an older acquaintance');
    expect(fromTravelerPerspective('a family friend')).toBe('a family friend');
  });
});

describe('opening prompt', () => {
  const card = {
    scenario_id: 'x', title: 'x',
    persona: { name: 'Maya', traveling_with: 'her father', backstory: 'b' },
    role_play_instructions: 'r',
    emotional_presentation: { label: 'calm' },
    ground_truth: { type: 'innocent' as const, indicators_present: [] },
    reveal: { summary: 's', teaching_points: [] },
  };

  it('frames the opening as a natural airport or immigration first contact', () => {
    const prompt = buildSystemPrompt(card);
    expect(prompt).toContain('airport personnel or an immigration officer');
    expect(prompt).toContain('not a scripted border declaration');
    expect(prompt).toContain('documents, trip purpose, or a companion description unless the interviewer first asks');
  });
});

describe('fixture opening line', () => {
  const card = {
    scenario_id: 'x', title: 'x',
    persona: { name: 'Maya', traveling_with: 'her father', backstory: 'b' },
    role_play_instructions: 'r',
    emotional_presentation: { label: 'calm' },
    ground_truth: { type: 'innocent' as const, indicators_present: [] },
    reveal: { summary: 's', teaching_points: [] },
  };

  it('never announces name or third-person companion', async () => {
    const [opening] = await fixtureTraveler.reply(card, [], 'sess-test');
    expect(opening.text).not.toMatch(/I'm Maya/);
    expect(opening.text).not.toMatch(/\bher father\b/);
  });

  it('selects opening options from the full random range', async () => {
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0).mockReturnValueOnce(0.999999);
    try {
      const [first] = await fixtureTraveler.reply(card, [], 'sess-test');
      const [last] = await fixtureTraveler.reply(card, [], 'sess-test');
      expect(first.text).toBe('Hi.');
      expect(last.text).toBe('Is there something I can do for you?');
    } finally {
      random.mockRestore();
    }
  });
});
