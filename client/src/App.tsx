import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import {
	getSessionReveal,
	createSession,
	submitTurn,
	endSession,
	requestFeedback,
	getHistory,
} from './api';
import type {
	ScenarioReveal,
	Turn,
	FeedbackReport,
} from './api';

type View = 'home' | 'session' | 'feedback' | 'history';

const DIMENSION_LABELS: Record<string, string> = {
	'open-questions': 'Open Questions',
	'trauma-informed-language': 'Trauma-Informed Language',
	'indicator-recognition': 'Indicator Recognition',
	'false-positive-discipline': 'False-Positive Discipline',
	'referral-protocol': 'Referral Protocol',
};

// Static tips derived from indicator catalog and rubric
const TRAINING_TIPS = [
	{
		id: 'open-questions',
		title: 'Ask Open Questions',
		text: 'Use "How has your trip been?" instead of "Are you being trafficked?" Open prompts let travelers volunteer information.',
	},
	{
		id: 'trauma-informed',
		title: 'Trauma-Informed Language',
		text: 'Remove pressure. "Take your time" and "I understand" keep frightened people talking.',
	},
	{
		id: 'indicators',
		title: 'Look for Indicators',
		text: 'Notice: companion answers for traveler, no itinerary knowledge, scripted stories, not in control of documents, fearful deference.',
	},
	{
		id: 'false-positive',
		title: 'Avoid False Positives',
		text: 'Escalate on behavioral clusters, not nervousness alone. Innocent travelers may be anxious about flying.',
	},
	{
		id: 'referral',
		title: 'Follow Referral Protocol',
		text: 'Refer through proper channels — never confront, accuse, or attempt rescue directly.',
	},
];

export default function App() {
	const [view, setView] = useState<View>('home');

	// ── Start view ────────────────────────────────────────────────────────────
	const [startError, setStartError] = useState('');
	const [starting, setStarting] = useState(false);

	// ── Session view ──────────────────────────────────────────────────────────
	const [sessionId, setSessionId] = useState('');
	const [travelerName, setTravelerName] = useState('');
	const [turns, setTurns] = useState<Turn[]>([]);
	const [sessionStatus, setSessionStatus] = useState('active');
	const [nudge, setNudge] = useState<string | null>(null);
	const [turnText, setTurnText] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [sessionError, setSessionError] = useState('');
	const [decisionReason, setDecisionReason] = useState('');
	const [deciding, setDeciding] = useState(false);
	const [notes, setNotes] = useState('');
	const chatEndRef = useRef<HTMLDivElement>(null);

	// ── Feedback view ─────────────────────────────────────────────────────────
	const [feedback, setFeedback] = useState<FeedbackReport | null>(null);
	const [reveal, setReveal] = useState<ScenarioReveal | null>(null);
	const [feedbackError, setFeedbackError] = useState('');

	// ── History view ───────────────────────────────────────────────────────────
	const [historyReports, setHistoryReports] = useState<FeedbackReport[]>([]);
	const [historyError, setHistoryError] = useState('');

	// ── Load notes from localStorage when session starts ───────────────────────
	useEffect(() => {
		if (sessionId) {
			const saved = localStorage.getItem(`lumi-notes-${sessionId}`);
			setNotes(saved ?? '');
		}
	}, [sessionId]);

	// ── Auto-save notes to localStorage ───────────────────────────────────────
	useEffect(() => {
		if (sessionId) {
			localStorage.setItem(`lumi-notes-${sessionId}`, notes);
		}
	}, [notes, sessionId]);

	// ── Auto-scroll chat to bottom ────────────────────────────────────────────
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [turns]);

	// ── Handlers ──────────────────────────────────────────────────────────────

	async function handleStartSession() {
		setStarting(true);
		try {
			const session = await createSession();
			setSessionId(session.session_id);
			setTravelerName(session.traveler_name);
			setTurns(session.opening_turns);
			setSessionStatus('active');
			setNudge(null);
			setTurnText('');
			setDecisionReason('');
			setSessionError('');
			setView('session');
		} catch (e) {
			setStartError((e as Error).message);
		} finally {
			setStarting(false);
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
		setNotes('');
		setView('home');
	}

	function handleViewHistory() {
		setHistoryError('');
		getHistory()
			.then(setHistoryReports)
			.catch(e => setHistoryError(e.message));
		setView('history');
	}

	// ── History helpers ───────────────────────────────────────────────────────

	const getSessionDate = useCallback((sessionId: string): string => {
		// session_id format: sess-YYYY-MM-DD-XXXX
		const match = sessionId.match(/sess-(\d{4}-\d{2}-\d{2})/);
		return match ? match[1] : '';
	}, []);

	const getDaysWithSessions = useCallback((): Set<string> => {
		const days = new Set<string>();
		historyReports.forEach(r => {
			const date = getSessionDate(r.session_id);
			if (date) {
				days.add(date);
			}
		});
		return days;
	}, [historyReports, getSessionDate]);

	const getCorrectRate = useCallback((): number => {
		if (historyReports.length === 0) return 0;
		const correct = historyReports.filter(r => r.decision_outcome.appropriate).length;
		return Math.round((correct / historyReports.length) * 100);
	}, [historyReports]);

	const getAvgScore = useCallback((): number => {
		if (historyReports.length === 0) return 0;
		const total = historyReports.reduce((sum, r) => {
			const avg = r.dimensions.reduce((s, d) => s + d.score, 0) / r.dimensions.length;
			return sum + avg;
		}, 0);
		return Math.round((total / historyReports.length) * 10) / 10;
	}, [historyReports]);

	// ── Render ────────────────────────────────────────────────────────────────

	if (view === 'home') {
		return (
			<div className="lumi-app lumi-home">
				<header className="lumi-header">
					<h1>Lumi</h1>
					<p className="lumi-subtitle">Training Simulator</p>
				</header>
				{startError && <div className="lumi-error">{startError}</div>}
				<div className="home-hero">
					<img src="/Lumi.jpg" alt="Lumi Training" className="cover-image" />
				</div>
				<div className="home-actions">
					<button
						className="btn btn-primary btn-large"
						onClick={handleStartSession}
						disabled={starting}
					>
						{starting ? 'Starting…' : 'Start Session'}
					</button>
					<button
						className="btn btn-secondary btn-large"
						onClick={handleViewHistory}
					>
						View History
					</button>
				</div>
			</div>
		);
	}

	if (view === 'session') {
		const canSubmitTurn = sessionStatus === 'active' || sessionStatus === 'nudged';
		const mustDecide = sessionStatus === 'awaiting_decision';

		return (
			<div className="lumi-app lumi-session-layout">
				<header className="lumi-header">
					<button className="btn-back" onClick={handleReset}>← Home</button>
					<div className="session-meta">
						<span className="session-title">Practice interview — {travelerName}</span>
						<span className={`session-badge badge-${sessionStatus}`}>{sessionStatus.replace('_', ' ')}</span>
					</div>
				</header>

				<div className="session-container">
					<aside className="notes-panel">
						<h3>Notes</h3>
						<textarea
							className="notes-textarea"
							placeholder="Take notes during the interview..."
							value={notes}
							onChange={e => setNotes(e.target.value)}
						/>
						{notes && <span className="notes-saved">Saved</span>}
					</aside>

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

					<aside className="tips-panel">
						<h3>Training Tips</h3>
						{TRAINING_TIPS.map(tip => (
							<div key={tip.id} className="tip-item">
								<strong>{tip.title}</strong>
								<p>{tip.text}</p>
							</div>
						))}
					</aside>
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

	// ── Feedback view ───────────────────────────────────────────────────────────
	if (view === 'feedback' && !feedback) {
		// Session ended but the debrief fetch failed — retryable; the decision
		// itself is already committed.
		return (
			<div className="lumi-app lumi-feedback">
				<header className="lumi-header">
					<h1>Debrief</h1>
					<p className="lumi-subtitle">{reveal?.title ?? 'Practice session'}</p>
				</header>
				{feedbackError && <div className="lumi-error">{feedbackError}</div>}
				<div className="feedback-actions">
					<button className="btn btn-primary" onClick={() => loadDebrief(sessionId)}>
						Retry loading debrief
					</button>
					<button className="btn" onClick={handleReset}>
						Back to home
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
					<p className="lumi-subtitle">{reveal?.title ?? 'Practice session'}</p>
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

				{(feedback.modeled_alternatives?.length ?? 0) > 0 && (
					<section className="alternatives-section">
						<h2>Better questions you could have asked</h2>
						{feedback.modeled_alternatives!.map((alt, i) => (
							<div key={i} className="alternative-row">
								<button className="anchor-chip" onClick={() => scrollToTurn(alt.turn_id)}>
									{alt.turn_id}
								</button>
								<div className="alternative-body">
									<p className="alternative-question">"{alt.suggested_question}"</p>
									<p className="alternative-why">{alt.why}</p>
								</div>
							</div>
						))}
					</section>
				)}

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
					<button className="btn btn-primary" onClick={handleViewHistory}>
						View History
					</button>
					<button className="btn" onClick={handleReset}>
						Try Another Session
					</button>
				</div>
			</div>
		);
	}

	// ── History view ───────────────────────────────────────────────────────────
	if (view === 'history') {
		const daysWithSessions = getDaysWithSessions();
		const correctRate = getCorrectRate();
		const avgScore = getAvgScore();

		// Calendar for current month
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const firstDay = new Date(year, month, 1).getDay();

		// Score trend data (last 10 sessions)
		const trendData = historyReports.slice(-10).map((r, i) => ({
			index: i,
			score: r.dimensions.reduce((s, d) => s + d.score, 0) / r.dimensions.length,
		}));

		return (
			<div className="lumi-app lumi-history">
				<header className="lumi-header">
					<button className="btn-back" onClick={handleReset}>← Home</button>
					<h1>Training History</h1>
				</header>

				{historyError && <div className="lumi-error">{historyError}</div>}

				<div className="history-stats">
					<div className="stat-tile">
						<span className="stat-value">{historyReports.length}</span>
						<span className="stat-label">Total Sessions</span>
					</div>
					<div className="stat-tile">
						<span className="stat-value">{correctRate}%</span>
						<span className="stat-label">Correct Decision Rate</span>
					</div>
					<div className="stat-tile">
						<span className="stat-value">{avgScore}/5</span>
						<span className="stat-label">Average Score</span>
					</div>
				</div>

				<div className="history-content">
					<section className="calendar-section">
						<h2>{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
						<div className="calendar-grid">
							{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
								<div key={d} className="calendar-header">{d}</div>
							))}
							{Array.from({ length: firstDay }).map((_, i) => (
								<div key={`empty-${i}`} className="calendar-day empty"></div>
							))}
							{Array.from({ length: daysInMonth }, (_, i) => {
								const day = i + 1;
								const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
								const hasSession = daysWithSessions.has(dateStr);
								return (
									<div key={day} className={`calendar-day ${hasSession ? 'has-session' : ''}`}>
										{day}
										{hasSession && <span className="session-dot"></span>}
									</div>
								);
							})}
						</div>
					</section>

					<section className="trend-section">
						<h2>Score Trend</h2>
						{trendData.length > 0 ? (
							<svg className="trend-chart" viewBox="0 0 300 100" preserveAspectRatio="none">
								<path
									className="trend-line"
									d={`M0,${100 - trendData[0].score * 20} ${trendData.map(d => `L${d.index * 30 + 10},${100 - d.score * 20}`).join(' ')}`}
									fill="none"
								/>
								{trendData.map(d => (
									<circle
										key={d.index}
										cx={d.index * 30 + 10}
										cy={100 - d.score * 20}
										r="3"
										className="trend-point"
									/>
								))}
							</svg>
						) : (
							<p className="no-data">No sessions yet</p>
						)}
					</section>
				</div>
			</div>
		);
	}

	return null;
}