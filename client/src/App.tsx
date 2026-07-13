import { useState, useEffect, useRef } from 'react';
import './App.css';
import {
	getScenarios,
	getSessionReveal,
	createSession,
	submitTurn,
	endSession,
	requestFeedback,
} from './api';
import type {
	ScenarioListItem,
	ScenarioReveal,
	Turn,
	FeedbackReport,
} from './api';

type View = 'scenarios' | 'session' | 'feedback';

const DIMENSION_LABELS: Record<string, string> = {
	'open-questions': 'Open Questions',
	'trauma-informed-language': 'Trauma-Informed Language',
	'indicator-recognition': 'Indicator Recognition',
	'false-positive-discipline': 'False-Positive Discipline',
	'referral-protocol': 'Referral Protocol',
};

export default function App() {
	const [view, setView] = useState<View>('scenarios');

	// ── Scenarios view ────────────────────────────────────────────────────────
	const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
	const [scenariosError, setScenariosError] = useState('');
	const [starting, setStarting] = useState<string | null>(null); // scenario_id being started

	// ── Session view ──────────────────────────────────────────────────────────
	const [sessionId, setSessionId] = useState('');
	const [currentScenario, setCurrentScenario] = useState<ScenarioListItem | null>(null);
	const [travelerName, setTravelerName] = useState('');
	const [turns, setTurns] = useState<Turn[]>([]);
	const [sessionStatus, setSessionStatus] = useState('active');
	const [nudge, setNudge] = useState<string | null>(null);
	const [turnText, setTurnText] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [sessionError, setSessionError] = useState('');
	const [decisionReason, setDecisionReason] = useState('');
	const [deciding, setDeciding] = useState(false);
	const chatEndRef = useRef<HTMLDivElement>(null);

	// ── Feedback view ─────────────────────────────────────────────────────────
	const [feedback, setFeedback] = useState<FeedbackReport | null>(null);
	const [reveal, setReveal] = useState<ScenarioReveal | null>(null);
	const [feedbackError, setFeedbackError] = useState('');

	// ── Load scenarios on mount ───────────────────────────────────────────────
	useEffect(() => {
		getScenarios()
			.then(setScenarios)
			.catch(() => setScenariosError('Could not load scenarios. Is the server running?'));
	}, []);

	// ── Auto-scroll chat to bottom ────────────────────────────────────────────
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [turns]);

	// ── Handlers ──────────────────────────────────────────────────────────────

	async function handleStartSession(scenario: ScenarioListItem) {
		setStarting(scenario.scenario_id);
		try {
			const session = await createSession(scenario.scenario_id);
			setSessionId(session.session_id);
			setCurrentScenario(scenario);
			setTravelerName(session.traveler_name);
			setTurns(session.opening_turns);
			setSessionStatus('active');
			setNudge(null);
			setTurnText('');
			setDecisionReason('');
			setSessionError('');
			setView('session');
		} catch (e) {
			setScenariosError((e as Error).message);
		} finally {
			setStarting(null);
		}
	}

	async function handleSubmitTurn(e: React.FormEvent) {
		e.preventDefault();
		if (!turnText.trim() || submitting) return;
		setSubmitting(true);
		setSessionError('');
		try {
			const result = await submitTurn(sessionId, turnText.trim());
			setTurns(prev => [...prev, result.turn, ...result.traveler_turns]);
			setSessionStatus(result.session_status);
			setNudge(result.nudge ?? null);
			setTurnText('');
		} catch (e) {
			setSessionError((e as Error).message);
		} finally {
			setSubmitting(false);
		}
	}

	// Fetch feedback + reveal for an already-ended session. Kept separate from
	// ending so a transient failure here is retryable — the decision itself is
	// committed exactly once and can't be re-posted.
	async function loadDebrief(id: string) {
		try {
			const [fb, rv] = await Promise.all([
				requestFeedback(id),
				getSessionReveal(id),
			]);
			setFeedback(fb);
			setReveal(rv);
			setFeedbackError('');
		} catch (e) {
			setFeedbackError(`Could not load the debrief: ${(e as Error).message}`);
		}
	}

	async function handleDecision(decision: 'refer' | 'no_action') {
		setDeciding(true);
		setSessionError('');
		try {
			await endSession(sessionId, decision, decisionReason || undefined);
		} catch (e) {
			setSessionError((e as Error).message);
			setDeciding(false);
			return;
		}
		// The session is over — always move to the debrief view; feedback/reveal
		// load (and can be retried) there.
		await loadDebrief(sessionId);
		setDeciding(false);
		setView('feedback');
	}

	function handleReset() {
		setFeedback(null);
		setReveal(null);
		setFeedbackError('');
		setView('scenarios');
	}

	// ── Render ────────────────────────────────────────────────────────────────

	if (view === 'scenarios') {
		return (
			<div className="lumi-app">
				<header className="lumi-header">
					<h1>Lumi</h1>
					<p className="lumi-subtitle">Training Simulator — Choose a scenario to practice</p>
				</header>
				{scenariosError && <div className="lumi-error">{scenariosError}</div>}
				{scenarios.length === 0 && !scenariosError && (
					<p className="lumi-loading">Loading scenarios…</p>
				)}
				<ul className="scenario-list">
					{scenarios.map(s => (
						<li key={s.scenario_id} className="scenario-card">
							<div className="scenario-info">
								<span className="scenario-title">{s.title}</span>
								{s.difficulty && (
									<span className="scenario-difficulty">
										{'●'.repeat(s.difficulty)}{'○'.repeat(3 - s.difficulty)}
									</span>
								)}
							</div>
							<button
								className="btn btn-primary"
								onClick={() => handleStartSession(s)}
								disabled={starting === s.scenario_id}
							>
								{starting === s.scenario_id ? 'Starting…' : 'Start'}
							</button>
						</li>
					))}
				</ul>
			</div>
		);
	}

	if (view === 'session') {
		const canSubmitTurn = sessionStatus === 'active' || sessionStatus === 'nudged';
		const mustDecide = sessionStatus === 'awaiting_decision';

		return (
			<div className="lumi-app lumi-session">
				<header className="lumi-header">
					<button className="btn-back" onClick={handleReset}>← Scenarios</button>
					<div className="session-meta">
						<span className="session-title">{currentScenario?.title}</span>
						<span className={`session-badge badge-${sessionStatus}`}>{sessionStatus.replace('_', ' ')}</span>
					</div>
				</header>

				<div className="chat-thread">
					{turns.map(turn => (
						<div key={turn.turn_id} className={`bubble bubble-${turn.role}`}>
							<span className="bubble-label">
								{turn.role === 'trainee' ? 'You' : turn.role === 'companion' ? 'Companion' : travelerName}
							</span>
							<p className="bubble-text">{turn.text}</p>
						</div>
					))}
					{nudge === 'consider_deciding' && (
						<div className="nudge-banner">
							You've asked many questions — consider making your decision.
						</div>
					)}
					{mustDecide && (
						<div className="nudge-banner nudge-hard">
							Turn limit reached. You must now make your decision.
						</div>
					)}
					<div ref={chatEndRef} />
				</div>

				{sessionError && <div className="lumi-error lumi-error-inline">{sessionError}</div>}

				{canSubmitTurn && !mustDecide && (
					<form className="turn-form" onSubmit={handleSubmitTurn}>
						<input
							className="turn-input"
							type="text"
							placeholder={`Say something to ${travelerName}…`}
							value={turnText}
							onChange={e => setTurnText(e.target.value)}
							disabled={submitting}
							autoFocus
						/>
						<button className="btn btn-primary" type="submit" disabled={submitting || !turnText.trim()}>
							{submitting ? '…' : 'Send'}
						</button>
					</form>
				)}

				<div className="decision-panel">
					<input
						className="reason-input"
						type="text"
						placeholder="Optional: state your reason…"
						value={decisionReason}
						onChange={e => setDecisionReason(e.target.value)}
						disabled={deciding}
					/>
					<div className="decision-buttons">
						<button
							className="btn btn-no-action"
							onClick={() => handleDecision('no_action')}
							disabled={deciding}
						>
							{deciding ? 'Processing…' : 'No Action'}
						</button>
						<button
							className="btn btn-refer"
							onClick={() => handleDecision('refer')}
							disabled={deciding}
						>
							{deciding ? 'Processing…' : 'Refer'}
						</button>
					</div>
				</div>
			</div>
		);
	}

	// ── Feedback view ─────────────────────────────────────────────────────────
	if (view === 'feedback' && !feedback) {
		// Session ended but the debrief fetch failed — retryable; the decision
		// itself is already committed.
		return (
			<div className="lumi-app lumi-feedback">
				<header className="lumi-header">
					<h1>Debrief</h1>
					<p className="lumi-subtitle">{currentScenario?.title}</p>
				</header>
				{feedbackError && <div className="lumi-error">{feedbackError}</div>}
				<div className="feedback-actions">
					<button className="btn btn-primary" onClick={() => loadDebrief(sessionId)}>
						Retry loading debrief
					</button>
					<button className="btn" onClick={handleReset}>
						Back to scenarios
					</button>
				</div>
			</div>
		);
	}

	if (view === 'feedback' && feedback) {
		const { decision_outcome, dimensions, summary } = feedback;
		const avgScore = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
		const scrollToTurn = (turnId: string) => {
			document.getElementById(`turn-${turnId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		};

		return (
			<div className="lumi-app lumi-feedback">
				<header className="lumi-header">
					<h1>Debrief</h1>
					<p className="lumi-subtitle">{currentScenario?.title}</p>
				</header>

				<div className="decision-outcome">
					<span className={`outcome-badge ${decision_outcome.appropriate ? 'outcome-correct' : 'outcome-incorrect'}`}>
						{decision_outcome.appropriate ? '✓ Correct decision' : '✗ Incorrect decision'}
					</span>
					<span className="outcome-detail">
						You chose <strong>{decision_outcome.trainee_decision.replace('_', ' ')}</strong> — scenario was <strong>{decision_outcome.ground_truth_type}</strong>
					</span>
				</div>

				<div className="avg-score">
					Average score: <strong>{avgScore.toFixed(1)} / 5</strong>
				</div>

				<div className="summary-text">{summary}</div>

				<section className="rubric-section">
					<h2>Rubric</h2>
					{dimensions.map(dim => (
						<div key={dim.dimension_id} className="rubric-row">
							<div className="rubric-header">
								<span className="rubric-name">{DIMENSION_LABELS[dim.dimension_id] ?? dim.dimension_id}</span>
								<span className="rubric-score">{dim.score}/5</span>
							</div>
							<div className="score-bar-track">
								<div
									className={`score-bar score-bar-${dim.score}`}
									style={{ width: `${(dim.score / 5) * 100}%` }}
								/>
							</div>
							<p className="rubric-rationale">{dim.rationale}</p>
							{dim.anchors.length > 0 && (
								<p className="rubric-anchors">
									Moments:{' '}
									{dim.anchors.map(a => (
										<button key={a} className="anchor-chip" onClick={() => scrollToTurn(a)}>
											{a}
										</button>
									))}
								</p>
							)}
						</div>
					))}
				</section>

				<section className="transcript-section">
					<h2>Transcript</h2>
					{turns.map(t => (
						<div key={t.turn_id} id={`turn-${t.turn_id}`} className={`transcript-turn transcript-${t.role}`}>
							<span className="transcript-turn-id">{t.turn_id}</span>
							<span className="transcript-role">{t.role === 'trainee' ? 'You' : t.role === 'companion' ? 'Companion' : travelerName || 'Traveler'}</span>
							<span className="transcript-text">{t.text}</span>
						</div>
					))}
				</section>

				{reveal && (
					<section className="reveal-section">
						<h2>What was actually happening</h2>
						<p className="reveal-summary">{reveal.reveal.summary}</p>
						{reveal.reveal.teaching_points.length > 0 && (
							<>
								<h3>Teaching points</h3>
								<ul className="teaching-points">
									{reveal.reveal.teaching_points.map((pt, i) => (
										<li key={i}>{pt}</li>
									))}
								</ul>
							</>
						)}
					</section>
				)}

				{feedbackError && <div className="lumi-error">{feedbackError}</div>}

				<div className="feedback-actions">
					<button className="btn btn-primary" onClick={handleReset}>
						Try Another Scenario
					</button>
				</div>
			</div>
		);
	}

	return null;
}

