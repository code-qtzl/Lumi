/**
 * Unit tests for session mechanics:
 * - Decision gate (must commit refer/no_action to end)
 * - Soft nudge at 20 trainee turns
 * - Hard stop at 30 trainee turns (locks turns, still requires the decision)
 * - Session state transitions
 *
 * Runs against the fixture traveler (no GEMINI_API_KEY in tests).
 */

import { createSession, submitTurn, endSession, getTranscript, getSessionView } from '../session/engine';
import { setTraveler } from '../traveler';
import { fixtureTraveler } from '../traveler/fixture';
import { ScenarioCard } from '../contracts';

// A minimal scenario card for testing
const testCard: ScenarioCard = {
  scenario_id: 'test-scenario',
  title: 'Test Scenario',
  persona: {
    name: 'Test',
    traveling_with: '',
    backstory: 'Test backstory',
  },
  role_play_instructions: 'Test instructions',
  emotional_presentation: {
    label: 'ordinary-nervous',
  },
  ground_truth: {
    type: 'innocent',
    indicators_present: [],
  },
  reveal: {
    summary: 'Nothing was wrong.',
    teaching_points: ['Test point'],
  },
};

beforeAll(() => setTraveler(fixtureTraveler));

describe('Session Mechanics', () => {
  describe('createSession', () => {
    it('creates a session with a traveler opening turn', async () => {
      const result = await createSession(testCard, 'text');
      expect(result.session_id).toMatch(/^sess-/);
      expect(result.scenario_id).toBe('test-scenario');
      expect(result.mode).toBe('text');
      expect(result.traveler_name).toBe('Test');
      expect(result.opening_turns.length).toBeGreaterThanOrEqual(1);
      expect(result.opening_turns[0].role).toBe('traveler');
      expect(result.opening_turns[0].turn_id).toBe('t001');
    });
  });

  describe('submitTurn', () => {
    it('accepts a trainee turn and returns traveler turns', async () => {
      const session = await createSession(testCard, 'text');
      const result = await submitTurn(session.session_id, 'Where are you headed?');

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.turn.role).toBe('trainee');
      expect(result.turn.turn_id).toBe('t002');
      expect(result.traveler_turns.length).toBeGreaterThanOrEqual(1);
      expect(result.traveler_turns[0].role).toBe('traveler');
      expect(result.session_status).toBe('active');
    });

    it('rejects turns for non-existent sessions', async () => {
      const result = await submitTurn('sess-nonexistent', 'Hello');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('rejects turns for completed sessions', async () => {
      const session = await createSession(testCard, 'text');
      endSession(session.session_id, 'no_action');
      const result = await submitTurn(session.session_id, 'Hello');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session already completed');
      }
    });
  });

  describe('soft nudge at 20 trainee turns', () => {
    it('sends a nudge when trainee reaches 20 turns', async () => {
      const session = await createSession(testCard, 'text');

      for (let i = 0; i < 19; i++) {
        const result = await submitTurn(session.session_id, `Question ${i + 1}`);
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        // No nudge before 20
        expect(result.nudge).toBeUndefined();
      }

      // 20th trainee turn should trigger the nudge
      const result = await submitTurn(session.session_id, 'Question 20');
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.nudge).toBe('consider_deciding');
      expect(result.session_status).toBe('nudged');
    });
  });

  describe('hard cap at 30 trainee turns', () => {
    async function capSession() {
      const session = await createSession(testCard, 'text');
      for (let i = 0; i < 29; i++) {
        const result = await submitTurn(session.session_id, `Question ${i + 1}`);
        expect('error' in result).toBe(false);
        if ('error' in result) throw new Error(result.error);
        expect(result.session_status).not.toBe('awaiting_decision');
      }
      const capped = await submitTurn(session.session_id, 'Question 30');
      expect('error' in capped).toBe(false);
      if ('error' in capped) throw new Error(capped.error);
      return { session, capped };
    }

    it('locks interviewing at 30 trainee turns and requires a decision', async () => {
      const { capped } = await capSession();
      expect(capped.nudge).toBe('decision_required');
      expect(capped.session_status).toBe('awaiting_decision');
      expect(capped.traveler_turns).toHaveLength(0);
    });

    it('rejects further turns after the cap', async () => {
      const { session } = await capSession();
      const result = await submitTurn(session.session_id, 'Question 31');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toMatch(/decision/i);
      }
    });

    it('still accepts a decision after the cap (decision gate survives the cap)', async () => {
      const { session } = await capSession();
      const result = endSession(session.session_id, 'refer', 'Behavioral cluster observed');
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.ended).toBe(true);
      expect(result.transcript.decision.value).toBe('refer');
      // All 30 trainee turns are preserved in the transcript
      expect(result.transcript.turns.filter(t => t.role === 'trainee').length).toBe(30);
    });
  });

  describe('endSession', () => {
    it('ends a session with a decision and returns a transcript', async () => {
      const session = await createSession(testCard, 'text');
      await submitTurn(session.session_id, 'Where are you going?');

      const result = endSession(session.session_id, 'no_action', 'No indicators present');
      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.ended).toBe(true);
      expect(result.transcript.session_id).toBe(session.session_id);
      expect(result.transcript.decision.value).toBe('no_action');
      expect(result.transcript.decision.stated_reason).toBe('No indicators present');
      expect(result.transcript.turns.length).toBeGreaterThanOrEqual(3); // opening + trainee + traveler
    });

    it('rejects ending a non-existent session', () => {
      const result = endSession('sess-nonexistent', 'no_action');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('rejects ending an already-completed session', async () => {
      const session = await createSession(testCard, 'text');
      endSession(session.session_id, 'no_action');
      const result = endSession(session.session_id, 'refer');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session already completed');
      }
    });
  });

  describe('transcript immutability (decision seals the record)', () => {
    it('drops an LLM reply that resolves after the session ended', async () => {
      // Slow traveler: reply resolves only when we release it
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      setTraveler({
        name: 'slow-fake',
        reply: async (card, turns) => {
          if (turns.length === 0) return [{ role: 'traveler', text: 'Opening.' }];
          await gate;
          return [{ role: 'traveler', text: 'Late reply.' }];
        },
      });

      try {
        const session = await createSession(testCard, 'text');
        const pending = submitTurn(session.session_id, 'Question?'); // in flight
        const ended = endSession(session.session_id, 'no_action');
        expect('error' in ended).toBe(false);
        if ('error' in ended) return;
        const sealedCount = ended.transcript.turns.length;

        release();
        const result = await pending;
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.traveler_turns).toHaveLength(0); // stale reply dropped

        const transcript = getTranscript(session.session_id);
        if ('error' in transcript) throw new Error('expected transcript');
        expect(transcript.turns.length).toBe(sealedCount); // record unchanged
        expect(transcript.turns.some(t => t.text === 'Late reply.')).toBe(false);
      } finally {
        setTraveler(fixtureTraveler);
      }
    });
  });

  describe('getTranscript', () => {
    it('refuses a transcript for an active session (no fabricated decision)', async () => {
      const session = await createSession(testCard, 'text');
      await submitTurn(session.session_id, 'Hello');
      const result = getTranscript(session.session_id);
      expect('error' in result).toBe(true);
    });

    it('returns the transcript of record after the session ends', async () => {
      const session = await createSession(testCard, 'text');
      await submitTurn(session.session_id, 'Hello');
      endSession(session.session_id, 'no_action');
      const result = getTranscript(session.session_id);
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.turns.length).toBeGreaterThanOrEqual(2);
      expect(result.decision.value).toBe('no_action');
    });

    it('returns status and turns mid-session via getSessionView', async () => {
      const session = await createSession(testCard, 'text');
      await submitTurn(session.session_id, 'Hello');
      const view = getSessionView(session.session_id);
      expect('error' in view).toBe(false);
      if ('error' in view) return;
      expect(view.status).toBe('active');
      expect(view.turns.length).toBeGreaterThanOrEqual(2);
    });

    it('returns error for non-existent session', () => {
      const result = getTranscript('sess-nonexistent');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session not found');
      }
    });
  });
});
