import { useEffect, useRef, useState } from 'react';
import type {
	InterviewMessage,
	InterviewSession,
	RiskLevel,
	Speaker,
	ToneSignalSummary,
	VoiceAnalysisResult,
} from '../types';
import './ConversationPanel.css';

interface ConversationPanelProps {
	session: InterviewSession;
	messages: InterviewMessage[];
	onSendMessage: (payload: {
		content: string;
		speaker: Speaker;
		source: 'text' | 'voice';
		toneSignals?: ToneSignalSummary;
	}) => Promise<void>;
	onAnalyzeVoice: (request: {
		blob: Blob;
		speaker: Speaker;
		isBaselineCapture: boolean;
		reasonTag?: string;
	}) => Promise<VoiceAnalysisResult>;
	onOverrideRisk: (
		messageId: string,
		nextLevel: RiskLevel,
		justification: string,
		supervisorAcknowledged: boolean,
	) => Promise<void>;
}

interface TranscriptDraft {
	text: string;
	speaker: Speaker;
	toneSignals?: ToneSignalSummary;
	confidence: number;
	requiresManualConfirm: boolean;
	blocked: boolean;
	blockReason?: string;
	detectedLanguage: string;
}

export default function ConversationPanel({
	session,
	messages,
	onSendMessage,
	onAnalyzeVoice,
	onOverrideRisk,
}: ConversationPanelProps) {
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [speaker, setSpeaker] = useState<Speaker>('traveler');
	const [recordingMode, setRecordingMode] = useState<
		'idle' | 'baseline' | 'utterance'
	>('idle');
	const [recordingSeconds, setRecordingSeconds] = useState(0);
	const [voiceBusy, setVoiceBusy] = useState(false);
	const [voiceWarning, setVoiceWarning] = useState('');
	const [voiceUnavailable, setVoiceUnavailable] = useState(false);
	const [transcriptDraft, setTranscriptDraft] =
		useState<TranscriptDraft | null>(null);
	const [overrideTargetId, setOverrideTargetId] = useState<string | null>(
		null,
	);
	const [overrideLevel, setOverrideLevel] = useState<RiskLevel>('risky');
	const [overrideJustification, setOverrideJustification] = useState('');
	const [supervisorAcknowledged, setSupervisorAcknowledged] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const audioChunksRef = useRef<Blob[]>([]);
	const autoStopTimeoutRef = useRef<number | null>(null);
	const tickIntervalRef = useRef<number | null>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	useEffect(() => {
		return () => {
			if (autoStopTimeoutRef.current) {
				window.clearTimeout(autoStopTimeoutRef.current);
			}
			if (tickIntervalRef.current) {
				window.clearInterval(tickIntervalRef.current);
			}
			mediaStreamRef.current
				?.getTracks()
				.forEach((track) => track.stop());
		};
	}, []);

	const hasBaseline = Boolean(session.toneState.baseline);

	const resetRecorder = () => {
		if (autoStopTimeoutRef.current) {
			window.clearTimeout(autoStopTimeoutRef.current);
			autoStopTimeoutRef.current = null;
		}
		if (tickIntervalRef.current) {
			window.clearInterval(tickIntervalRef.current);
			tickIntervalRef.current = null;
		}
		mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
		mediaStreamRef.current = null;
		mediaRecorderRef.current = null;
		setRecordingMode('idle');
		setRecordingSeconds(0);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim()) return;

		setLoading(true);
		const content = input;
		setInput('');

		try {
			await onSendMessage({
				content,
				speaker,
				source: 'text',
			});
		} finally {
			setLoading(false);
		}
	};

	const startRecording = async (isBaselineCapture: boolean) => {
		if (!navigator.mediaDevices?.getUserMedia || voiceUnavailable) {
			setVoiceWarning(
				'Voice capture is unavailable in this browser. Continue with manual text entry.',
			);
			setVoiceUnavailable(true);
			return;
		}

		setVoiceWarning('');
		setTranscriptDraft(null);

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			mediaStreamRef.current = stream;
			audioChunksRef.current = [];

			const recorder = new MediaRecorder(stream, {
				mimeType: MediaRecorder.isTypeSupported('audio/webm')
					? 'audio/webm'
					: undefined,
			});
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunksRef.current.push(event.data);
				}
			};

			recorder.onstop = async () => {
				const blob = new Blob(audioChunksRef.current, {
					type: recorder.mimeType || 'audio/webm',
				});
				resetRecorder();

				setVoiceBusy(true);
				try {
					const result = await onAnalyzeVoice({
						blob,
						speaker,
						isBaselineCapture,
						reasonTag: isBaselineCapture ? 'initial' : undefined,
					});

					if (isBaselineCapture) {
						setVoiceWarning(
							'Traveler baseline captured successfully.',
						);
						return;
					}

					if (result.blocked) {
						setVoiceWarning(
							result.blockReason ||
								'Voice transcript confidence is too low. Retry or enter text manually.',
						);
						setTranscriptDraft(null);
						return;
					}

					setTranscriptDraft({
						text: result.transcriptOriginal,
						speaker: result.speaker,
						toneSignals: result.toneSignals,
						confidence: result.confidence,
						requiresManualConfirm: result.requiresManualConfirm,
						blocked: result.blocked,
						blockReason: result.blockReason,
						detectedLanguage: result.detectedLanguage,
					});
				} catch (error) {
					setVoiceWarning(
						error instanceof Error
							? error.message
							: 'Voice service unavailable. Continue in text mode.',
					);
					setVoiceUnavailable(true);
				} finally {
					setVoiceBusy(false);
				}
			};

			recorder.start();
			setRecordingMode(isBaselineCapture ? 'baseline' : 'utterance');
			setRecordingSeconds(0);
			tickIntervalRef.current = window.setInterval(() => {
				setRecordingSeconds((seconds) => seconds + 1);
			}, 1000);
			const maxDuration = isBaselineCapture ? 5000 : 20000;
			autoStopTimeoutRef.current = window.setTimeout(() => {
				recorder.stop();
			}, maxDuration);
		} catch {
			setVoiceWarning(
				'Microphone permission denied. Voice controls are disabled for this session; continue with manual text entry.',
			);
			setVoiceUnavailable(true);
		}
	};

	const stopRecording = () => {
		mediaRecorderRef.current?.stop();
	};

	const submitTranscriptDraft = async () => {
		if (!transcriptDraft || !transcriptDraft.text.trim()) {
			return;
		}

		setLoading(true);
		try {
			await onSendMessage({
				content: transcriptDraft.text,
				speaker: transcriptDraft.speaker,
				source: 'voice',
				toneSignals: transcriptDraft.toneSignals,
			});
			setTranscriptDraft(null);
			setVoiceWarning('');
		} finally {
			setLoading(false);
		}
	};

	const handleOverrideSubmit = async (message: InterviewMessage) => {
		if (!overrideTargetId || !overrideJustification.trim()) {
			return;
		}

		await onOverrideRisk(
			overrideTargetId,
			overrideLevel,
			overrideJustification,
			supervisorAcknowledged,
		);
		setOverrideTargetId(null);
		setOverrideJustification('');
		setSupervisorAcknowledged(false);
		setOverrideLevel(message.riskAssessment?.level ?? 'risky');
	};

	const renderToneSignals = (toneSignals?: ToneSignalSummary) => {
		if (!toneSignals) {
			return null;
		}

		return (
			<div className='tone-panel'>
				<div className='tone-panel-header'>Tone Signals</div>
				<div className='tone-chip-row'>
					<span className='tone-chip'>
						Whisper{' '}
						{Math.round(toneSignals.whisperLikelihood * 100)}%
					</span>
					<span className='tone-chip'>
						Pauses {toneSignals.longPauseFrequency}/min
					</span>
					<span className='tone-chip'>
						Rate {toneSignals.speechRateWps} w/s
					</span>
				</div>
				<ul className='tone-reasons'>
					{toneSignals.explanation.map((reason) => (
						<li key={reason}>{reason}</li>
					))}
				</ul>
			</div>
		);
	};

	return (
		<div className='conversation-panel'>
			<div className='voice-toolbar'>
				<div className='toolbar-group'>
					<label htmlFor='speaker-select'>Speaker</label>
					<select
						id='speaker-select'
						value={speaker}
						onChange={(e) => setSpeaker(e.target.value as Speaker)}
						disabled={
							loading || voiceBusy || recordingMode !== 'idle'
						}
					>
						<option value='traveler'>Traveler</option>
						<option value='officer'>Officer</option>
					</select>
				</div>

				<div className='toolbar-group toolbar-actions'>
					<button
						type='button'
						className='btn btn-secondary'
						onClick={() => startRecording(false)}
						disabled={
							loading ||
							voiceBusy ||
							voiceUnavailable ||
							recordingMode !== 'idle' ||
							(speaker === 'traveler' && !hasBaseline)
						}
					>
						{voiceBusy ? 'Analyzing Voice...' : 'Push to Talk'}
					</button>
					<button
						type='button'
						className='btn btn-primary'
						onClick={() => startRecording(true)}
						disabled={
							loading ||
							voiceBusy ||
							voiceUnavailable ||
							recordingMode !== 'idle' ||
							speaker !== 'traveler'
						}
					>
						{hasBaseline
							? 'Re-Capture Baseline'
							: 'Capture 5s Baseline'}
					</button>
					{recordingMode !== 'idle' && (
						<button
							type='button'
							className='btn btn-danger'
							onClick={stopRecording}
						>
							Stop ({recordingSeconds}s)
						</button>
					)}
				</div>
			</div>

			{!hasBaseline && (
				<div className='warning-banner inline-banner'>
					Traveler baseline is required before traveler voice tone
					scoring.
				</div>
			)}

			{voiceWarning && (
				<div className='warning-banner inline-banner'>
					{voiceWarning}
				</div>
			)}

			{transcriptDraft && (
				<div className='transcript-review'>
					<div className='transcript-review-header'>
						<h3>Review Voice Transcript</h3>
						<span>
							Confidence{' '}
							{Math.round(transcriptDraft.confidence * 100)}% ·{' '}
							{transcriptDraft.detectedLanguage.toUpperCase()}
						</span>
					</div>
					<textarea
						value={transcriptDraft.text}
						onChange={(e) =>
							setTranscriptDraft((current) =>
								current
									? { ...current, text: e.target.value }
									: current,
							)
						}
						rows={4}
					/>
					{transcriptDraft.requiresManualConfirm && (
						<p className='review-note'>
							Manual confirmation required for confidence between
							80% and 88%.
						</p>
					)}
					{renderToneSignals(transcriptDraft.toneSignals)}
					<div className='transcript-actions'>
						<button
							type='button'
							className='btn btn-secondary'
							onClick={() => setTranscriptDraft(null)}
						>
							Discard
						</button>
						<button
							type='button'
							className='btn btn-primary'
							onClick={submitTranscriptDraft}
							disabled={loading || !transcriptDraft.text.trim()}
						>
							Confirm and Send
						</button>
					</div>
				</div>
			)}

			<div className='messages-container'>
				{messages.length === 0 ? (
					<div className='no-messages'>
						<p>
							Start the interview by entering your initial
							observations.
						</p>
					</div>
				) : (
					messages.map((msg) => (
						<div
							key={msg.id}
							className={`message message-${msg.role}`}
						>
							<div className='message-header'>
								<span className='role-badge'>
									{msg.role === 'officer'
										? '👮 Officer'
										: '🤖 Assistant'}
								</span>
								<div className='message-meta'>
									{msg.speaker && (
										<span className='meta-badge'>
											{msg.speaker === 'traveler'
												? 'Traveler'
												: 'Officer Prompt'}
										</span>
									)}
									{msg.source && (
										<span className='meta-badge'>
											{msg.source === 'voice'
												? 'Voice'
												: 'Text'}
										</span>
									)}
									<span className='timestamp'>
										{new Date(
											msg.timestamp,
										).toLocaleTimeString()}
									</span>
								</div>
							</div>
							<div className='message-content'>{msg.content}</div>
							{msg.riskAssessment && (
								<>
									<div
										className={`risk-badge risk-${msg.riskAssessment.level}`}
									>
										Risk:{' '}
										{(
											msg.riskAssessment.displayLevel ||
											msg.riskAssessment.level
										).toUpperCase()}{' '}
										({msg.riskAssessment.confidence}%
										confidence)
									</div>
									<p className='assessment-summary'>
										{msg.riskAssessment.summary}
									</p>
									{renderToneSignals(
										msg.riskAssessment.toneSignals,
									)}
									{msg.role === 'officer' && (
										<div className='override-section'>
											<button
												type='button'
												className='btn btn-secondary override-toggle'
												onClick={() => {
													setOverrideTargetId(
														overrideTargetId ===
															msg.id
															? null
															: msg.id,
													);
													setOverrideLevel(
														msg.riskAssessment
															?.level || 'risky',
													);
												}}
											>
												Override Risk
											</button>
											{overrideTargetId === msg.id && (
												<div className='override-form'>
													<select
														value={overrideLevel}
														onChange={(e) =>
															setOverrideLevel(
																e.target
																	.value as RiskLevel,
															)
														}
													>
														<option value='safe'>
															Low
														</option>
														<option value='risky'>
															Elevated
														</option>
														<option value='unsafe'>
															Critical
														</option>
													</select>
													<textarea
														value={
															overrideJustification
														}
														onChange={(e) =>
															setOverrideJustification(
																e.target.value,
															)
														}
														placeholder='Required justification for the override'
														rows={3}
													/>
													<label className='checkbox-row'>
														<input
															type='checkbox'
															checked={
																supervisorAcknowledged
															}
															onChange={(e) =>
																setSupervisorAcknowledged(
																	e.target
																		.checked,
																)
															}
														/>
														Supervisor acknowledged
														if Critical impact
													</label>
													<button
														type='button'
														className='btn btn-primary'
														onClick={() =>
															handleOverrideSubmit(
																msg,
															)
														}
														disabled={
															!overrideJustification.trim()
														}
													>
														Apply Override
													</button>
												</div>
											)}
										</div>
									)}
								</>
							)}
						</div>
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			<form onSubmit={handleSubmit} className='input-form'>
				<textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={`Enter ${speaker} ${speaker === 'traveler' ? 'response' : 'prompt'}...`}
					disabled={loading}
					className='message-input'
					rows={3}
				/>
				<button
					type='submit'
					disabled={loading || !input.trim()}
					className='btn btn-primary'
				>
					{loading ? 'Analyzing...' : 'Send'}
				</button>
			</form>
		</div>
	);
}
