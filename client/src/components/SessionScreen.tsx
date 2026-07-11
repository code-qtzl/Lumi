import { useState } from 'react';
import type { Decision, Turn } from '../contracts';
import type { SessionStatus } from '../api';
import './SessionScreen.css';

interface SessionScreenProps {
	travelerName: string;
	turns: Turn[];
	status: SessionStatus;
	nudge?: 'consider_deciding' | 'decision_required';
	submitting: boolean;
	ending: boolean;
	onSubmitTurn: (text: string) => void;
	onEndSession: (decision: Decision['value'], statedReason: string) => void;
}

const ROLE_LABEL: Record<Turn['role'], string> = {
	trainee: 'You',
	traveler: 'Traveler',
	companion: 'Companion',
};

function SessionScreen({
	travelerName,
	turns,
	status,
	nudge,
	submitting,
	ending,
	onSubmitTurn,
	onEndSession,
}: SessionScreenProps) {
	const [draft, setDraft] = useState('');
	const [decision, setDecision] = useState<Decision['value'] | ''>('');
	const [statedReason, setStatedReason] = useState('');

	const decisionRequired = status === 'awaiting_decision';
	const canSendTurn = !decisionRequired && status !== 'completed';

	const handleSend = () => {
		const text = draft.trim();
		if (!text || submitting) return;
		onSubmitTurn(text);
		setDraft('');
	};

	const handleEnd = () => {
		if (!decision || ending) return;
		onEndSession(decision, statedReason.trim());
	};

	return (
		<div className="session-screen">
			<header className="session-header">
				<h1>Interviewing {travelerName}</h1>
			</header>

			{nudge === 'consider_deciding' && (
				<div className="warning-banner">You've asked a lot of questions — consider whether you have enough to decide.</div>
			)}
			{nudge === 'decision_required' && (
				<div className="warning-banner">Turn limit reached. Commit a decision to end the session.</div>
			)}

			<div className="turn-list">
				{turns.map((turn) => (
					<div key={turn.turn_id} className={`turn turn-${turn.role}`}>
						<span className="turn-role">{ROLE_LABEL[turn.role]}</span>
						<p className="turn-text">{turn.text}</p>
					</div>
				))}
			</div>

			{canSendTurn && (
				<div className="turn-input">
					<textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								handleSend();
							}
						}}
						placeholder="Ask a question…"
						rows={2}
					/>
					<button className="btn btn-primary" onClick={handleSend} disabled={!draft.trim() || submitting}>
						{submitting ? 'Sending…' : 'Send'}
					</button>
				</div>
			)}

			<section className="decision-panel">
				<h2>Decision</h2>
				<p>End the session by committing a decision — this is the only way out.</p>
				<div className="decision-options">
					<label>
						<input
							type="radio"
							name="decision"
							value="no_action"
							checked={decision === 'no_action'}
							onChange={() => setDecision('no_action')}
						/>
						No action
					</label>
					<label>
						<input
							type="radio"
							name="decision"
							value="refer"
							checked={decision === 'refer'}
							onChange={() => setDecision('refer')}
						/>
						Refer
					</label>
				</div>
				<textarea
					className="decision-reason"
					value={statedReason}
					onChange={(e) => setStatedReason(e.target.value)}
					placeholder="Optional: one-line reason for your decision"
					rows={2}
				/>
				<button className="btn btn-secondary" onClick={handleEnd} disabled={!decision || ending}>
					{ending ? 'Ending…' : 'Commit decision & end session'}
				</button>
			</section>
		</div>
	);
}

export default SessionScreen;
