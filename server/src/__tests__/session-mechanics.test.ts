/**
 * Unit tests for session mechanics:
 * - Decision gate (must commit refer/no_action to end)
 * - Soft nudge at 20 trainee turns
 * - Hard stop at 30 trainee turns
 * - Session state transitions
 */

import { createSession, submitTurn, endSession, getTranscript } from '../session/engine';
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

describe('Session Mechanics', () => {
  describe('createSession', () => {
    it('creates a session with a traveler opening turn', () => {
      const result = createSession(testCard, 'text');
      expect(result.session_id).toMatch(/^sess-/);
      expect(result.scenario_id).toBe('test-scenario');
      expect(result.mode).toBe('text');
      expect(result.traveler_name).toBe('Test');
      expect(result.first_turn.role).toBe('traveler');
      expect(result.first_turn.turn_id).toBe('t001');
    });
  });

  describe('submitTurn', () => {
    it('accepts a trainee turn and returns a traveler reply', () => {
      const session = createSession(testCard, 'text');
      const result = submitTurn(session.session_id, 'Where are you headed?');

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.turn.role).toBe('trainee');
      expect(result.turn.turn_id).toBe('t002');
      expect(result.traveler_reply).not.toBeNull();
      expect(result.traveler_reply!.role).toBe('traveler');
      expect(result.session_status).toBe('active');
    });

    it('rejects turns for non-existent sessions', () => {
      const result = submitTurn('sess-nonexistent', 'Hello');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('rejects turns for completed sessions', () => {
      const session = createSession(testCard, 'text');
      endSession(session.session_id, 'no_action');
      const result = submitTurn(session.session_id, 'Hello');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session already completed');
      }
    });
  });

  describe('soft nudge at 20 trainee turns', () => {
    it('sends a nudge when trainee reaches 20 turns', () => {
      const session = createSession(testCard, 'text');

      // Submit 19 trainee turns (each creates 1 trainee + 1 traveler = 2 turns)
      // After 19 submissions, we've had 1 (opening) + 19*2 = 39 total turns, 19 trainee
      for (let i = 0; i < 19; i++) {
        const result = submitTurn(session.session_id, `Question ${i + 1}`);
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        // No nudge before 20
        expect(result.nudge).toBeUndefined();
      }

      // 20th trainee turn should trigger the nudge
      const result = submitTurn(session.session_id, 'Question 20');
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.nudge).toBe('consider_deciding');
      expect(result.session_status).toBe('nudged');
    });
  });

  describe('hard cap at 30 trainee turns', () => {
    it('auto-ends the session at 30 trainee turns', () => {
      const session = createSession(testCard, 'text');

      // Submit 29 trainee turns (safe)
      for (let i = 0; i < 29; i++) {
        const result = submitTurn(session.session_id, `Question ${i + 1}`);
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.session_status).not.toBe('completed');
      }

      // 30th trainee turn should auto-end
      const result = submitTurn(session.session_id, 'Question 30');
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.nudge).toBe('auto_ended');
      expect(result.session_status).toBe('completed');
      expect(result.traveler_reply).toBeNull();
    });
  });

  describe('endSession', () => {
    it('ends a session with a decision and returns a transcript', () => {
      const session = createSession(testCard, 'text');
      submitTurn(session.session_id, 'Where are you going?');

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

    it('rejects ending an already-completed session', () => {
      const session = createSession(testCard, 'text');
      endSession(session.session_id, 'no_action');
      const result = endSession(session.session_id, 'refer');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Session already completed');
      }
    });
  });

  describe('getTranscript', () => {
    it('returns a transcript for an active session', () => {
      const session = createSession(testCard, 'text');
      submitTurn(session.session_id, 'Hello');
      const result = getTranscript(session.session_id);
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.turns.length).toBeGreaterThanOrEqual(2);
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