import { createMixedTraveler } from '../traveler';
import { ScenarioCard, Turn } from '../contracts';
import { TravelerEngine } from '../traveler/types';

const card: ScenarioCard = {
  scenario_id: 'selection-test',
  title: 'Selection test',
  persona: { name: 'Maya', traveling_with: '', backstory: 'Test backstory' },
  role_play_instructions: 'Stay in character.',
  emotional_presentation: { label: 'calm' },
  ground_truth: { type: 'innocent', indicators_present: [] },
  reveal: { summary: 'Test.', teaching_points: [] },
};
const turns: Turn[] = [];

describe('model / fixture traveler mix', () => {
  const model: TravelerEngine = {
    name: 'model-test',
    reply: async () => [{ role: 'traveler', text: 'From the model.' }],
  };

  it('routes values below 0.75 to the model and the remainder to the fixture', async () => {
    const mixed = createMixedTraveler(model);
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0.749999).mockReturnValueOnce(0.75);
    try {
      await expect(mixed.reply(card, turns, 'sess-test')).resolves.toEqual([
        { role: 'traveler', text: 'From the model.' },
      ]);
      const fixtureReply = await mixed.reply(card, turns, 'sess-test');
      expect(fixtureReply[0].text).not.toBe('From the model.');
    } finally {
      random.mockRestore();
    }
  });
});
