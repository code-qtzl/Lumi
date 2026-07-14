import { useState, useEffect, useRef, useCallback } from 'react';
import {
	getSessionReveal,
	createSession,
	submitTurn,
	endSession,
	requestFeedback,
	getHistory,
	clearHistory,
} from './api';
import type { ScenarioReveal, Turn, FeedbackReport } from './api';

type View = 'home' | 'session' | 'feedback' | 'history';
type Theme = 'dark' | 'light';

// Apply theme to document
function applyTheme(theme: Theme) {
	document.documentElement.setAttribute('data-theme', theme);
}

// Load theme from localStorage
function loadTheme(): Theme {
	return (localStorage.getItem('lumi-theme') as Theme) || 'dark';
}

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

const STATUS_BADGE_CLASSES: Record<string, string> = {
	active: 'bg-[#14532d] text-[#86efac]',
	nudged: 'bg-[#713f12] text-[#fde68a]',
	awaiting_decision: 'bg-[#7f1d1d] text-[#fca5a5]',
	completed: 'bg-[#1e3a5f] text-[#93c5fd]',
};

const SCORE_BAR_CLASSES: Record<number, string> = {
	1: 'bg-red-600',
	2: 'bg-orange-600',
	3: 'bg-yellow-600',
	4: 'bg-green-600',
	5: 'bg-cyan-600',
};

const ERROR_BANNER =
	'mx-5 mb-4 rounded-md border border-[#7f1d1d] bg-[#3d1a1a] px-4 py-2.5 text-sm text-[#f87171]';
const ERROR_BANNER_INLINE =
	'mb-2 rounded-md border border-[#7f1d1d] bg-[#3d1a1a] px-4 py-2.5 text-sm text-[#f87171]';
const SECTION_H2 =
	'm-0 mb-3.5 border-b border-border pb-1.5 text-base font-semibold text-fg';

function ThemeToggle({
	theme,
	onToggle,
}: {
	theme: Theme;
	onToggle: () => void;
}) {
	return (
		<button
			className='rounded-md border border-border bg-surface-alt px-3 py-1.5 text-sm text-fg hover:bg-surface'
			onClick={onToggle}
			aria-label='Toggle dark mode'
		>
			{theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
		</button>
	);
}

export default function App() {
	const [view, setView] = useState<View>('home');
	const [theme, setTheme] = useState<Theme>(() => {
		const saved = loadTheme();
		applyTheme(saved);
		return saved;
	});

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
	const [hasHistory, setHasHistory] = useState(false);

	// ── Load theme on mount ───────────────────────────────────────────────────
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	const toggleTheme = useCallback(() => {
		setTheme((prev) => {
			const next = prev === 'dark' ? 'light' : 'dark';
			localStorage.setItem('lumi-theme', next);
			return next;
		});
	}, []);

	// ── Check for existing history on mount ───────────────────────────────────
	useEffect(() => {
		getHistory()
			.then((reports) =>
				setHasHistory(Array.isArray(reports) && reports.length > 0),
			)
			.catch(() => setHasHistory(false));
	}, []);

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
		setStartError('');
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
			setTurns((prev) => [
				...prev,
				result.turn,
				...result.traveler_turns,
			]);
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
			setFeedbackError(
				`Could not load the debrief: ${(e as Error).message}`,
			);
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
			// Guard at the state boundary: a shape drift degrades to the error
			// banner instead of a slice-on-object crash unmounting the app.
			.then((r) => setHistoryReports(Array.isArray(r) ? r : []))
			.catch((e) => setHistoryError(e.message));
		setView('history');
	}

	async function handleClearHistory() {
		if (
			!window.confirm(
				'Clear all saved training history? This cannot be undone.',
			)
		)
			return;
		setHistoryError('');
		try {
			await clearHistory();
			setHistoryReports([]);
			setHasHistory(false);
		} catch (e) {
			setHistoryError(`Could not clear history: ${(e as Error).message}`);
		}
	}

	// ── History helpers ───────────────────────────────────────────────────────

	const getSessionDate = useCallback((sessionId: string): string => {
		// session_id format: sess-YYYY-MM-DD-XXXX
		const match = sessionId.match(/sess-(\d{4}-\d{2}-\d{2})/);
		return match ? match[1] : '';
	}, []);

	const getDaysWithSessions = useCallback((): Set<string> => {
		const days = new Set<string>();
		historyReports.forEach((r) => {
			const date = getSessionDate(r.session_id);
			if (date) {
				days.add(date);
			}
		});
		return days;
	}, [historyReports, getSessionDate]);

	const getCorrectRate = useCallback((): number => {
		if (historyReports.length === 0) return 0;
		const correct = historyReports.filter(
			(r) => r.decision_outcome.appropriate,
		).length;
		return Math.round((correct / historyReports.length) * 100);
	}, [historyReports]);

	const getAvgScore = useCallback((): number => {
		if (historyReports.length === 0) return 0;
		const total = historyReports.reduce((sum, r) => {
			const avg =
				r.dimensions.reduce((s, d) => s + d.score, 0) /
				r.dimensions.length;
			return sum + avg;
		}, 0);
		return Math.round((total / historyReports.length) * 10) / 10;
	}, [historyReports]);

	// ── Render ────────────────────────────────────────────────────────────────

	if (view === 'home') {
		return (
			<div className='mx-auto flex min-h-screen max-w-[860px] flex-col bg-canvas pb-10'>
				<header className='mb-4 flex items-center justify-between border-b border-border px-5 pb-3 pt-5'>
					<div>
						<h1 className='m-0 mb-1 text-[1.6rem] font-semibold tracking-[-0.5px]'>
							Lumi
						</h1>
						<p className='m-0 text-sm text-fg-muted'>
							Training Simulator
						</p>
					</div>
					<ThemeToggle theme={theme} onToggle={toggleTheme} />
				</header>
				{startError && <div className={ERROR_BANNER}>{startError}</div>}
				<div className='px-5 py-5 text-center'>
					<img
						src='/Lumi.jpg'
						alt='Lumi Training'
						className='h-auto w-full max-h-[320px] rounded-tile object-cover shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
					/>
				</div>
				<div className='mx-auto mt-4 grid max-w-[400px] grid-cols-2 gap-4 p-5'>
					<button
						className='btn btn-primary flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-tile px-6 py-3.5 text-base'
						onClick={handleStartSession}
						disabled={starting}
					>
						<span className='text-2xl leading-none' aria-hidden>
							▶
						</span>
						{starting ? 'Starting…' : 'Start Session'}
					</button>
					<button
						className={`btn flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-tile px-6 py-3.5 text-base ${
							hasHistory
								? 'btn-secondary'
								: 'group relative cursor-not-allowed border border-border bg-[#2a2a2a] text-[#666]'
						}`}
						onClick={handleViewHistory}
						disabled={!hasHistory}
					>
						<span className='text-2xl leading-none' aria-hidden>
							📊
						</span>
						View History
						{!hasHistory && (
							<span className='pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#333] px-3 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100'>
								No history yet
							</span>
						)}
					</button>
				</div>
			</div>
		);
	}

	if (view === 'session') {
		const canSubmitTurn =
			sessionStatus === 'active' || sessionStatus === 'nudged';
		const mustDecide = sessionStatus === 'awaiting_decision';

		return (
			<div className='mx-auto flex min-h-screen max-w-[1200px] flex-col bg-canvas pb-4 lg:pb-6'>
				<header className='mb-4 flex items-center justify-between border-b border-border px-5 pb-3 pt-5'>
					<div>
						<button
							className='mb-2 block border-none bg-transparent p-0 text-sm text-fg-muted hover:text-fg-secondary'
							onClick={handleReset}
						>
							← Home
						</button>
						<div className='flex flex-wrap items-center gap-2.5'>
							<span className='text-[0.95rem] font-semibold'>
								Practice interview — {travelerName}
							</span>
							<span
								className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${STATUS_BADGE_CLASSES[sessionStatus] ?? ''}`}
							>
								{sessionStatus.replace('_', ' ')}
							</span>
						</div>
					</div>
					<ThemeToggle theme={theme} onToggle={toggleTheme} />
				</header>

				<div className='flex flex-1 flex-col gap-4 p-4 lg:min-h-0 lg:flex-row lg:overflow-hidden'>
					<aside className='order-2 flex w-full shrink-0 flex-col rounded-lg border border-border bg-surface-alt p-3 lg:order-1 lg:w-[260px]'>
						<h3 className='m-0 mb-2.5 text-sm font-semibold text-fg'>
							Training Tips
						</h3>
						{TRAINING_TIPS.map((tip) => (
							<div
								key={tip.id}
								className='mb-2.5 rounded-[10px] border border-border bg-surface-alt px-3 py-2.5'
							>
								<strong className='mb-1 block text-[0.82rem] text-accent-fg'>
									{tip.title}
								</strong>
								<p className='m-0 text-[0.78rem] leading-[1.45] text-fg-secondary'>
									{tip.text}
								</p>
							</div>
						))}
					</aside>

					<div className='order-1 flex min-h-[320px] flex-1 flex-col gap-2.5 lg:order-2 lg:min-h-0'>
						<div className='flex min-h-[220px] flex-1 flex-col gap-2.5 overflow-y-auto rounded-tile border border-border bg-surface p-tile-pad lg:min-h-0'>
							{turns.map((turn) => (
								<div
									key={turn.turn_id}
									className={`max-w-[80%] rounded-[10px] px-3.5 py-2.5 leading-relaxed ${
										turn.role === 'trainee'
											? 'self-end rounded-br-[2px] bg-bubble-trainee'
											: 'self-start rounded-bl-[2px] bg-bubble-other'
									}`}
								>
									<span className='mb-1 block text-[0.72rem] font-bold uppercase tracking-wide text-fg-muted'>
										{turn.role === 'trainee'
											? 'You'
											: turn.role === 'companion'
												? 'Companion'
												: travelerName}
									</span>
									<p className='m-0 text-[0.95rem]'>
										{turn.text}
									</p>
								</div>
							))}
							{nudge === 'consider_deciding' && (
								<div className='rounded-md border border-[#713f12] bg-[#3d3400] px-3.5 py-2 text-center text-[0.85rem] text-[#fde68a]'>
									You've asked many questions — consider
									making your decision.
								</div>
							)}
							{mustDecide && (
								<div className='rounded-md border border-[#7f1d1d] bg-[#3d1a1a] px-3.5 py-2 text-center text-[0.85rem] text-[#fca5a5]'>
									Turn limit reached. You must now make your
									decision.
								</div>
							)}
							<div ref={chatEndRef} />
						</div>

						<div className='rounded-tile border border-border bg-surface p-3'>
							{sessionError && (
								<div className={ERROR_BANNER_INLINE}>
									{sessionError}
								</div>
							)}

							{canSubmitTurn && !mustDecide && (
								<form
									className='mb-2.5 flex gap-2'
									onSubmit={handleSubmitTurn}
								>
									<input
										className='flex-1 rounded-md border border-border bg-input px-3 py-2.5 text-[0.95rem] text-fg focus:border-primary focus:outline-none'
										type='text'
										placeholder={`Say something to ${travelerName}…`}
										value={turnText}
										onChange={(e) =>
											setTurnText(e.target.value)
										}
										disabled={submitting}
										autoFocus
									/>
									<button
										className='btn btn-primary'
										type='submit'
										disabled={
											submitting || !turnText.trim()
										}
									>
										{submitting ? '…' : 'Send'}
									</button>
								</form>
							)}

							<div className='flex flex-col gap-2 border-t border-border pt-2.5'>
								<input
									className='w-full rounded-md border border-border bg-input px-3 py-2 text-[0.85rem] text-fg focus:border-primary focus:outline-none'
									type='text'
									placeholder='Optional: state your reason…'
									value={decisionReason}
									onChange={(e) =>
										setDecisionReason(e.target.value)
									}
									disabled={deciding}
								/>
								<div className='flex gap-2.5'>
									<button
										className='btn btn-no-action'
										onClick={() =>
											handleDecision('no_action')
										}
										disabled={deciding}
									>
										{deciding ? 'Processing…' : 'No Action'}
									</button>
									<button
										className='btn btn-refer'
										onClick={() => handleDecision('refer')}
										disabled={deciding}
									>
										{deciding ? 'Processing…' : 'Refer'}
									</button>
								</div>
							</div>
						</div>
					</div>

					<aside className='order-3 flex w-full shrink-0 flex-col rounded-lg border border-border bg-surface-alt p-3 lg:w-[260px]'>
						<h3 className='m-0 mb-2.5 text-sm font-semibold text-fg'>
							Notes
						</h3>
						<textarea
							className='box-border min-h-[160px] w-full flex-1 resize-none rounded-md border border-border bg-input p-2 text-[0.85rem] text-fg focus:border-primary focus:outline-none lg:min-h-[120px]'
							placeholder='Take notes during the interview...'
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
						{notes && (
							<span className='mt-1 text-[0.7rem] text-[#86efac]'>
								Saved
							</span>
						)}
					</aside>
				</div>
			</div>
		);
	}

	// ── Feedback view ───────────────────────────────────────────────────────────
	if (view === 'feedback' && !feedback) {
		// Session ended but the debrief fetch failed — retryable; the decision
		// itself is already committed.
		return (
			<div className='mx-auto flex min-h-screen max-w-[1200px] flex-col bg-canvas pb-[60px]'>
				<header className='mb-4 flex items-center justify-between border-b border-border px-5 pb-3 pt-5'>
					<div>
						<h1 className='m-0 mb-1 text-[1.6rem] font-semibold tracking-[-0.5px]'>
							Debrief
						</h1>
						<p className='m-0 text-sm text-fg-muted'>
							{reveal?.title ?? 'Practice session'}
						</p>
					</div>
					<ThemeToggle theme={theme} onToggle={toggleTheme} />
				</header>
				{feedbackError && (
					<div className={ERROR_BANNER}>{feedbackError}</div>
				)}
				<div className='flex justify-center gap-2.5 px-5'>
					<button
						className='btn btn-primary'
						onClick={() => loadDebrief(sessionId)}
					>
						Retry loading debrief
					</button>
					<button className='btn btn-secondary' onClick={handleReset}>
						Back to home
					</button>
				</div>
			</div>
		);
	}

	if (view === 'feedback' && feedback) {
		const { decision_outcome, dimensions, summary } = feedback;
		const avgScore =
			dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
		const scrollToTurn = (turnId: string) => {
			document
				.getElementById(`turn-${turnId}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		};

		return (
			<div className='mx-auto flex min-h-screen max-w-[1200px] flex-col bg-canvas pb-[60px]'>
				<header className='mb-4 flex items-center justify-between border-b border-border px-5 pb-3 pt-5'>
					<div>
						<h1 className='m-0 mb-1 text-[1.6rem] font-semibold tracking-[-0.5px]'>
							Debrief
						</h1>
						<p className='m-0 text-sm text-fg-muted'>
							{reveal?.title ?? 'Practice session'}
						</p>
					</div>
					<ThemeToggle theme={theme} onToggle={toggleTheme} />
				</header>

				<div className='flex flex-col items-start gap-1 px-5 pb-4'>
					<span
						className={`rounded-full px-3.5 py-1 text-base font-bold ${decision_outcome.appropriate ? 'bg-[#14532d] text-[#86efac]' : 'bg-[#7f1d1d] text-[#fca5a5]'}`}
					>
						{decision_outcome.appropriate
							? '✓ Correct decision'
							: '✗ Incorrect decision'}
					</span>
					<span className='text-[0.85rem] text-fg-secondary'>
						You chose{' '}
						<strong>
							{decision_outcome.trainee_decision.replace(
								'_',
								' ',
							)}
						</strong>{' '}
						— scenario was{' '}
						<strong>{decision_outcome.ground_truth_type}</strong>
					</span>
				</div>

				<div className='px-5 pb-1.5 text-sm text-fg-secondary'>
					Average score: <strong>{avgScore.toFixed(1)} / 5</strong>
				</div>

				<div className='px-5 pb-5 text-sm leading-[1.6] text-fg-secondary'>
					{summary}
				</div>

				<section className='px-5 pb-6'>
					<h2 className={SECTION_H2}>Rubric</h2>
					{dimensions.map((dim) => (
						<div key={dim.dimension_id} className='mb-[18px]'>
							<div className='mb-1.5 flex justify-between'>
								<span className='text-[0.85rem] font-semibold'>
									{DIMENSION_LABELS[dim.dimension_id] ??
										dim.dimension_id}
								</span>
								<span className='text-[0.85rem] text-fg-secondary'>
									{dim.score}/5
								</span>
							</div>
							<div className='mb-1.5 h-1.5 overflow-hidden rounded-[3px] bg-track'>
								<div
									className={`h-full rounded-[3px] transition-[width] duration-[400ms] ease-in-out ${SCORE_BAR_CLASSES[dim.score] ?? ''}`}
									style={{
										width: `${(dim.score / 5) * 100}%`,
									}}
								/>
							</div>
							<p className='m-0 text-[0.82rem] leading-[1.5] text-fg-muted'>
								{dim.rationale}
							</p>
							{dim.anchors.length > 0 && (
								<p className='mt-1.5 text-[0.78rem] text-fg-muted'>
									Moments:{' '}
									{dim.anchors.map((a) => (
										<button
											key={a}
											className='mb-0.5 mr-1 inline-block rounded-[10px] border border-[#3a4a63] bg-transparent px-2 py-px text-[0.75rem] text-[#9db2d0] hover:bg-[#22304a]'
											onClick={() => scrollToTurn(a)}
										>
											{a}
										</button>
									))}
								</p>
							)}
						</div>
					))}
				</section>

				{(feedback.modeled_alternatives?.length ?? 0) > 0 && (
					<section className='tile mx-5 mt-6'>
						<h2 className={SECTION_H2}>
							Better questions you could have asked
						</h2>
						{feedback.modeled_alternatives!.map((alt, i) => (
							<div
								key={i}
								className='flex items-start gap-2.5 py-2'
							>
								<button
									className='mb-0.5 mr-1 inline-block rounded-[10px] border border-[#3a4a63] bg-transparent px-2 py-px text-[0.75rem] text-[#9db2d0] hover:bg-[#22304a]'
									onClick={() => scrollToTurn(alt.turn_id)}
								>
									{alt.turn_id}
								</button>
								<div className='flex-1'>
									<p className='m-0 text-sm text-[#d6e4f7]'>
										"{alt.suggested_question}"
									</p>
									<p className='mt-1 text-[0.82rem] leading-[1.5] text-fg-muted'>
										{alt.why}
									</p>
								</div>
							</div>
						))}
					</section>
				)}

				<section className='mt-6 px-5'>
					<h2 className={SECTION_H2}>Transcript</h2>
					{turns.map((t) => (
						<div
							key={t.turn_id}
							id={`turn-${t.turn_id}`}
							className='flex gap-2.5 rounded-md px-2 py-1.5 text-[0.85rem] leading-[1.5] target:bg-[#2b3a55]'
						>
							<span className='shrink-0 basis-10 font-mono text-[#8a8aa0]'>
								{t.turn_id}
							</span>
							<span
								className={`shrink-0 basis-[90px] font-semibold ${t.role === 'trainee' ? 'text-[#d0b89d]' : 'text-[#9db2d0]'}`}
							>
								{t.role === 'trainee'
									? 'You'
									: t.role === 'companion'
										? 'Companion'
										: travelerName || 'Traveler'}
							</span>
							<span className='flex-1'>{t.text}</span>
						</div>
					))}
				</section>

				{reveal && (
					<section className='px-5 pb-6'>
						<h2 className={SECTION_H2}>
							What was actually happening
						</h2>
						<p className='mb-2 text-sm leading-[1.6] text-fg-secondary'>
							{reveal.reveal.summary}
						</p>
						{reveal.reveal.teaching_points.length > 0 && (
							<>
								<h3 className='mb-2 mt-3 text-sm font-semibold text-fg-secondary'>
									Teaching points
								</h3>
								<ul className='m-0 flex flex-col gap-1.5 pl-[18px]'>
									{reveal.reveal.teaching_points.map(
										(pt, i) => (
											<li
												key={i}
												className='text-[0.85rem] leading-[1.5] text-fg-secondary'
											>
												{pt}
											</li>
										),
									)}
								</ul>
							</>
						)}
					</section>
				)}

				{feedbackError && (
					<div className={ERROR_BANNER}>{feedbackError}</div>
				)}

				<div className='flex justify-center gap-2.5 px-5'>
					<button
						className='btn btn-primary'
						onClick={handleViewHistory}
					>
						View History
					</button>
					<button
						className='btn btn-secondary'
						onClick={handleStartSession}
						disabled={starting}
					>
						{starting ? 'Starting…' : 'Try Another Session'}
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
			score:
				r.dimensions.reduce((s, d) => s + d.score, 0) /
				r.dimensions.length,
		}));
		const chart = {
			width: 320,
			height: 140,
			left: 34,
			right: 10,
			top: 10,
			bottom: 32,
		};
		const plotWidth = chart.width - chart.left - chart.right;
		const plotHeight = chart.height - chart.top - chart.bottom;
		const xFor = (index: number) =>
			trendData.length === 1
				? chart.left + plotWidth / 2
				: chart.left + (index * plotWidth) / (trendData.length - 1);
		const yFor = (score: number) =>
			chart.top + ((5 - score) / 4) * plotHeight;

		return (
			<div className='mx-auto flex min-h-screen max-w-[860px] flex-col bg-canvas pb-10'>
				<header className='mb-4 flex items-center justify-between border-b border-border px-5 pb-3 pt-5'>
					<div>
						<button
							className='mb-2 block border-none bg-transparent p-0 text-sm text-fg-muted hover:text-fg-secondary'
							onClick={handleReset}
						>
							← Home
						</button>
						<h1 className='m-0 mb-1 text-[1.6rem] font-semibold tracking-[-0.5px]'>
							Training History
						</h1>
					</div>
					<div className='flex items-center gap-2'>
						<button
							className='btn btn-danger'
							onClick={handleClearHistory}
							disabled={historyReports.length === 0}
						>
							Clear History
						</button>
						<ThemeToggle theme={theme} onToggle={toggleTheme} />
					</div>
				</header>

				{historyError && (
					<div className={ERROR_BANNER}>{historyError}</div>
				)}

				<div className='mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 px-5 pb-5'>
					<div className='tile min-w-[120px] flex-1 text-center'>
						<span className='block text-[1.8rem] font-bold text-primary'>
							{historyReports.length}
						</span>
						<span className='text-[0.75rem] uppercase tracking-wide text-fg-muted'>
							Total Sessions
						</span>
					</div>
					<div className='tile min-w-[120px] flex-1 text-center'>
						<span className='block text-[1.8rem] font-bold text-primary'>
							{correctRate}%
						</span>
						<span className='text-[0.75rem] uppercase tracking-wide text-fg-muted'>
							Correct Decision Rate
						</span>
					</div>
					<div className='tile min-w-[120px] flex-1 text-center'>
						<span className='block text-[1.8rem] font-bold text-primary'>
							{avgScore}/5
						</span>
						<span className='text-[0.75rem] uppercase tracking-wide text-fg-muted'>
							Average Score
						</span>
					</div>
				</div>

				<div className='grid grid-cols-[1.2fr_1fr] items-start gap-4 px-5'>
					<section className='tile'>
						<h2 className='m-0 mb-3 text-[0.95rem] font-semibold text-fg'>
							{now.toLocaleDateString('en-US', {
								month: 'long',
								year: 'numeric',
							})}
						</h2>
						<div className='grid grid-cols-7 gap-1'>
							{[
								'Sun',
								'Mon',
								'Tue',
								'Wed',
								'Thu',
								'Fri',
								'Sat',
							].map((d) => (
								<div
									key={d}
									className='py-1 text-center text-[0.7rem] text-fg-muted'
								>
									{d}
								</div>
							))}
							{Array.from({ length: firstDay }).map((_, i) => (
								<div
									key={`empty-${i}`}
									className='relative flex min-h-8 items-center justify-center px-1 py-2 text-[0.85rem] text-transparent'
								></div>
							))}
							{Array.from({ length: daysInMonth }, (_, i) => {
								const day = i + 1;
								const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
								const hasSession =
									daysWithSessions.has(dateStr);
								return (
									<div
										key={day}
										className={`relative flex min-h-8 items-center justify-center rounded-lg px-1 py-2 text-[0.85rem] ${
											hasSession
												? 'bg-accent-soft font-semibold text-fg'
												: 'text-fg-secondary'
										}`}
									>
										{day}
										{hasSession && (
											<span className='absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary'></span>
										)}
									</div>
								);
							})}
						</div>
					</section>

					<section className='tile'>
						<h2 className='m-0 mb-3 text-[0.95rem] font-semibold text-fg'>
							Score Trend
						</h2>
						{trendData.length > 0 ? (
							<svg
								className='h-[140px] w-full rounded-md bg-chart-bg'
								viewBox={`0 0 ${chart.width} ${chart.height}`}
								role='img'
								aria-label='Average rubric score by session'
							>
								<title>Average rubric score by session</title>
								{[1, 2, 3, 4, 5].map((score) => (
									<g key={score}>
										<line
											className='stroke-border [stroke-dasharray:2_3]'
											strokeWidth={1}
											x1={chart.left}
											x2={chart.width - chart.right}
											y1={yFor(score)}
											y2={yFor(score)}
										/>
										<text
											className='fill-fg-muted text-[9px]'
											x={chart.left - 6}
											y={yFor(score) + 3}
											textAnchor='end'
										>
											{score}
										</text>
									</g>
								))}
								<line
									className='stroke-fg-muted'
									strokeWidth={1}
									x1={chart.left}
									x2={chart.left}
									y1={chart.top}
									y2={chart.height - chart.bottom}
								/>
								<line
									className='stroke-fg-muted'
									strokeWidth={1}
									x1={chart.left}
									x2={chart.width - chart.right}
									y1={chart.height - chart.bottom}
									y2={chart.height - chart.bottom}
								/>
								<path
									className='stroke-primary'
									strokeWidth={2}
									d={trendData
										.map(
											(d, i) =>
												`${i === 0 ? 'M' : 'L'}${xFor(d.index)},${yFor(d.score)}`,
										)
										.join(' ')}
									fill='none'
								/>
								{trendData.map((d) => (
									<circle
										key={d.index}
										cx={xFor(d.index)}
										cy={yFor(d.score)}
										r='3'
										className='fill-primary'
									/>
								))}
								<text
									className='fill-fg-muted text-[10px]'
									x={chart.left + plotWidth / 2}
									y={chart.height - 5}
									textAnchor='middle'
								>
									Sessions (oldest → newest)
								</text>
								<text
									className='fill-fg-muted text-[10px]'
									x='11'
									y={chart.top + plotHeight / 2}
									textAnchor='middle'
									transform={`rotate(-90 11 ${chart.top + plotHeight / 2})`}
								>
									Average rubric score (1–5)
								</text>
							</svg>
						) : (
							<p className='p-5 text-center italic text-fg-muted'>
								No sessions yet
							</p>
						)}
					</section>
				</div>
			</div>
		);
	}

	return null;
}
