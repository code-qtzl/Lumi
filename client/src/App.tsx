import { useState } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import ConversationPanel from './components/ConversationPanel';
import RiskCard from './components/RiskCard';
import SessionInit from './components/SessionInit';
import type {
	InterviewSession,
	RiskLevel,
	Speaker,
	ToneSignalSummary,
	VoiceAnalysisResult,
} from './types';

interface MessageSubmission {
	content: string;
	speaker: Speaker;
	source: 'text' | 'voice';
	toneSignals?: ToneSignalSummary;
}

interface VoiceAnalyzeRequest {
	blob: Blob;
	speaker: Speaker;
	isBaselineCapture: boolean;
	reasonTag?: string;
}

function App() {
	const [session, setSession] = useState<InterviewSession | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string>('');

	const API_BASE =
		import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

	const handleStartSession = async (officerName: string) => {
		setLoading(true);
		setError('');

		try {
			const response = await fetch(`${API_BASE}/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ officerName }),
			});

			if (!response.ok) throw new Error('Failed to create session');

			const newSession = await response.json();
			setSession(newSession);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	const handleSendMessage = async ({
		content,
		speaker,
		source,
		toneSignals,
	}: MessageSubmission) => {
		if (!session) return;

		try {
			const response = await fetch(
				`${API_BASE}/sessions/${session.id}/messages`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						content,
						speaker,
						source,
						toneSignals,
					}),
				},
			);

			if (!response.ok) throw new Error('Failed to send message');

			const result = await response.json();

			// Update session with new messages and risk data
			setSession((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					messages: prev.messages.concat([
						result.message,
						result.assistantMessage,
					]),
					currentRiskLevel: result.sessionUpdated.currentRiskLevel,
					currentDisplayRiskLevel:
						result.sessionUpdated.currentDisplayRiskLevel,
					allIndicators: result.sessionUpdated.allIndicators,
					toneState: result.sessionUpdated.toneState ?? prev.toneState,
				};
			});
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to send message',
			);
		}
	};

	const handleAnalyzeVoice = async ({
		blob,
		speaker,
		isBaselineCapture,
		reasonTag,
	}: VoiceAnalyzeRequest): Promise<VoiceAnalysisResult> => {
		if (!session) {
			throw new Error('No active session');
		}

		const formData = new FormData();
		formData.append('audio', blob, 'utterance.webm');
		formData.append('speaker', speaker);
		formData.append('isBaselineCapture', String(isBaselineCapture));
		if (reasonTag) {
			formData.append('reasonTag', reasonTag);
		}

		const response = await fetch(
			`${API_BASE}/sessions/${session.id}/voice/analyze`,
			{
				method: 'POST',
				body: formData,
			},
		);

		const result = await response.json();

		if (!response.ok) {
			throw new Error(result.error || 'Voice analysis failed');
		}

		setSession((prev) => {
			if (!prev) {
				return prev;
			}

			return {
				...prev,
				toneState: {
					...prev.toneState,
					baseline: result.baselineCaptured
						? {
								...result.baseline,
								capturedAt: new Date(
									result.baseline?.capturedAt ?? Date.now(),
								),
							}
						: prev.toneState.baseline,
				},
			};
		});

		return result;
	};

	const handleOverrideRisk = async (
		messageId: string,
		nextLevel: RiskLevel,
		justification: string,
		supervisorAcknowledged: boolean,
	) => {
		if (!session) {
			return;
		}

		try {
			const response = await fetch(
				`${API_BASE}/sessions/${session.id}/risk-override`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						messageId,
						nextLevel,
						justification,
						supervisorAcknowledged,
					}),
				},
			);

			const result = await response.json();
			if (!response.ok) {
				throw new Error(result.error || 'Failed to override risk');
			}

			setSession((prev) => {
				if (!prev) {
					return prev;
				}

				return {
					...prev,
					messages: prev.messages.map((message) =>
						message.id === result.message.id
							? result.message
							: message,
					),
					currentRiskLevel: result.currentRiskLevel,
					currentDisplayRiskLevel: result.currentDisplayRiskLevel,
					riskOverrideAudit: result.riskOverrideAudit,
				};
			});
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to override risk',
			);
		}
	};

	const handleUpdateNotes = async (notes: string) => {
		if (!session) return;

		try {
			const response = await fetch(`${API_BASE}/sessions/${session.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes }),
			});

			if (!response.ok) throw new Error('Failed to update notes');

			const updated = await response.json();
			setSession(updated);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to update notes',
			);
		}
	};

	if (!session) {
		return (
			<SessionInit
				onStart={handleStartSession}
				loading={loading}
				error={error}
			/>
		);
	}

	return (
		<div className='app'>
			<header className='app-header'>
				<h1>Beacon Interview Assistant</h1>
				<p className='subtitle'>Trauma-Informed Risk Scoring Tool</p>
			</header>

			{error && <div className='error-banner'>{error}</div>}

			<main className='app-main'>
				<aside className='app-sidebar'>
					<Dashboard
						session={session}
						onUpdateNotes={handleUpdateNotes}
					/>
				</aside>

				<section className='app-content'>
					<ConversationPanel
						session={session}
						messages={session.messages}
						onSendMessage={handleSendMessage}
						onAnalyzeVoice={handleAnalyzeVoice}
						onOverrideRisk={handleOverrideRisk}
					/>
				</section>

				<aside className='app-risk-panel'>
					<RiskCard
						riskLevel={session.currentRiskLevel}
						displayRiskLevel={session.currentDisplayRiskLevel}
						indicators={session.allIndicators}
						confidence={
							session.messages.find((m) => m.riskAssessment)
								?.riskAssessment?.confidence || 50
						}
						toneState={session.toneState}
						riskOverrideAudit={session.riskOverrideAudit}
					/>
				</aside>
			</main>
		</div>
	);
}

export default App;
