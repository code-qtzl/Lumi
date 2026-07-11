import { useState } from 'react';
import './App.css';
import ScenarioSelect from './components/ScenarioSelect';
import SessionScreen from './components/SessionScreen';
import DebriefScreen from './components/DebriefScreen';
import type { Decision, FeedbackReport, ScenarioCard, Transcript, Turn } from './contracts';
import { createSession, endSession, getFeedback, submitTurn, type SessionStatus } from './api';

type Screen = 'select' | 'session' | 'debrief';

interface ActiveSession {
	sessionId: string;
	travelerName: string;
	turns: Turn[];
	status: SessionStatus;
	nudge?: 'consider_deciding' | 'decision_required';
}

interface Debrief {
	report: FeedbackReport;
	reveal: ScenarioCard['reveal'];
	transcript: Transcript;
}

function App() {
	const [screen, setScreen] = useState<Screen>('select');
	const [session, setSession] = useState<ActiveSession | null>(null);
	const [debrief, setDebrief] = useState<Debrief | null>(null);
	const [starting, setStarting] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [ending, setEnding] = useState(false);
	const [error, setError] = useState('');

	const handleSelectScenario = async (scenarioId: string) => {
		setStarting(true);
		setError('');
		try {
			const res = await createSession(scenarioId);
			setSession({
				sessionId: res.session_id,
				travelerName: res.traveler_name,
				turns: res.opening_turns,
				status: 'active',
			});
			setScreen('session');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start session');
		} finally {
			setStarting(false);
		}
	};

	const handleSubmitTurn = async (text: string) => {
		if (!session) return;
		setSubmitting(true);
		setError('');
		try {
			const res = await submitTurn(session.sessionId, text);
			setSession((prev) =>
				prev
					? {
							...prev,
							turns: [...prev.turns, res.turn, ...res.traveler_turns],
							status: res.session_status,
							nudge: res.nudge,
						}
					: prev,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to send turn');
		} finally {
			setSubmitting(false);
		}
	};

	const handleEndSession = async (decision: Decision['value'], statedReason: string) => {
		if (!session) return;
		setEnding(true);
		setError('');
		try {
			const endRes = await endSession(session.sessionId, decision, statedReason || undefined);
			const feedbackRes = await getFeedback(session.sessionId);
			setDebrief({ report: feedbackRes.report, reveal: feedbackRes.reveal, transcript: endRes.transcript });
			setScreen('debrief');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to end session');
		} finally {
			setEnding(false);
		}
	};

	const handleRestart = () => {
		setSession(null);
		setDebrief(null);
		setScreen('select');
	};

	return (
		<div className="app">
			{error && <div className="error-banner">{error}</div>}

			{screen === 'select' && <ScenarioSelect onSelect={handleSelectScenario} starting={starting} />}

			{screen === 'session' && session && (
				<SessionScreen
					travelerName={session.travelerName}
					turns={session.turns}
					status={session.status}
					nudge={session.nudge}
					submitting={submitting}
					ending={ending}
					onSubmitTurn={handleSubmitTurn}
					onEndSession={handleEndSession}
				/>
			)}

			{screen === 'debrief' && debrief && (
				<DebriefScreen
					report={debrief.report}
					reveal={debrief.reveal}
					transcript={debrief.transcript}
					onRestart={handleRestart}
				/>
			)}
		</div>
	);
}

export default App;
