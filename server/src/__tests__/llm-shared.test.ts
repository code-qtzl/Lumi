/**
 * Unit tests for the LLM traveler's shared parsing and never-reveal guard —
 * pure functions that gate everything a trainee sees from the model.
 */

import { parseReplies, trippedGuard } from '../traveler/llm-shared';

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
