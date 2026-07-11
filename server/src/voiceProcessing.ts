import { randomUUID } from 'crypto';
import { spawn, execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import {
	Speaker,
	ToneBaseline,
	ToneSignalSummary,
	VoiceAnalysisResult,
} from './types';

const execFileAsync = promisify(execFile);

const BLOCK_THRESHOLD = 0.8;
const MANUAL_CONFIRM_THRESHOLD = 0.88;
const FFMPEG_BIN = process.env.BEACON_FFMPEG_BIN || 'ffmpeg';

function getEnvNumber(
	envName: string,
	fallback: number,
	min?: number,
	max?: number,
): number {
	const raw = process.env[envName];
	if (!raw) {
		return fallback;
	}

	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	if (min !== undefined && parsed < min) {
		return fallback;
	}
	if (max !== undefined && parsed > max) {
		return fallback;
	}

	return parsed;
}

const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL?.trim() || 'flux-general-en';
const DEEPGRAM_EOT_THRESHOLD = getEnvNumber(
	'DEEPGRAM_EOT_THRESHOLD',
	0.7,
	0,
	1,
);
const DEEPGRAM_EOT_TIMEOUT_MS = getEnvNumber(
	'DEEPGRAM_EOT_TIMEOUT_MS',
	5000,
	500,
);
const STREAM_TIMEOUT_MS = getEnvNumber(
	'BEACON_VOICE_STREAM_TIMEOUT_MS',
	6000,
	1000,
);
const FLUSH_TIMEOUT_MS = getEnvNumber(
	'BEACON_VOICE_FLUSH_TIMEOUT_MS',
	1200,
	200,
);

const CONNECTION_OPTIONS = {
	model: DEEPGRAM_MODEL,
	eot_threshold: DEEPGRAM_EOT_THRESHOLD,
	eot_timeout_ms: DEEPGRAM_EOT_TIMEOUT_MS,
	encoding: 'linear16',
	sample_rate: 16000,
	interim_results: true,
	vad_events: true,
	punctuate: true,
	smart_format: true,
	detect_language: true,
};

interface WordTiming {
	word: string;
	start: number;
	end: number;
	confidence: number;
}

interface DeepgramTranscription {
	transcriptOriginal: string;
	transcriptForAnalysis: string;
	detectedLanguage: string;
	confidence: number;
	words: WordTiming[];
	durationSeconds: number;
}

interface AudioSignalMetrics {
	meanVolumeDb?: number;
}

export interface AnalyzeVoiceInput {
	audioBuffer: Buffer;
	mimeType: string;
	speaker: Speaker;
	isBaselineCapture: boolean;
	reasonTag?: string;
	baseline?: ToneBaseline;
}

export interface AnalyzeVoiceOptions {
	deepgramApiKey?: string;
	allowMockMode: boolean;
}

function sanitizeLanguage(language: string | undefined): string {
	if (!language) {
		return 'unknown';
	}

	return language.toLowerCase();
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function extensionFromMimeType(mimeType: string): string {
	if (mimeType.includes('webm')) return 'webm';
	if (mimeType.includes('ogg')) return 'ogg';
	if (mimeType.includes('wav')) return 'wav';
	if (mimeType.includes('mp4')) return 'mp4';
	return 'dat';
}

function buildMockResult(input: AnalyzeVoiceInput): DeepgramTranscription {
	const transcriptOriginal =
		input.speaker === 'traveler'
			? "I am speaking softly. He keeps my documents and I can't always reach my family."
			: 'Can you tell me who you are traveling with today?';

	return {
		transcriptOriginal,
		transcriptForAnalysis: transcriptOriginal,
		detectedLanguage: 'en',
		confidence: 0.91,
		words: transcriptOriginal.split(' ').map((word, index) => ({
			word,
			start: index * 0.32,
			end: index * 0.32 + 0.24,
			confidence: 0.9,
		})),
		durationSeconds: Math.max(
			3,
			transcriptOriginal.split(' ').length * 0.34,
		),
	};
}

function parseTranscriptPayload(data: unknown): DeepgramTranscription | null {
	const payload = data as {
		type?: string;
		event?: string;
		transcript?: string;
		confidence?: number;
		is_final?: boolean;
		speech_final?: boolean;
		duration?: number;
		channel?: {
			alternatives?: Array<{
				transcript?: string;
				confidence?: number;
				words?: WordTiming[];
				languages?: string[];
			}>;
		};
		metadata?: { language?: string };
		languages?: string[];
	};

	const alternative = payload.channel?.alternatives?.[0];
	const transcript = (
		payload.transcript ??
		alternative?.transcript ??
		''
	).trim();
	if (!transcript) {
		return null;
	}

	const words = alternative?.words ?? [];
	const languages = alternative?.languages ?? payload.languages ?? [];

	return {
		transcriptOriginal: transcript,
		transcriptForAnalysis: transcript,
		detectedLanguage: sanitizeLanguage(
			languages[0] ?? payload.metadata?.language,
		),
		confidence: Number(payload.confidence ?? alternative?.confidence ?? 0),
		words,
		durationSeconds: Number(payload.duration ?? 0),
	};
}

function extractWhisperLikelihood(
	confidence: number,
	meanVolumeDb: number | undefined,
): number {
	const lowConfidenceFactor = clamp01((0.9 - confidence) / 0.2);
	const volumeFactor =
		meanVolumeDb === undefined ? 0.3 : clamp01((-32 - meanVolumeDb) / 18);

	return round2(clamp01(lowConfidenceFactor * 0.45 + volumeFactor * 0.55));
}

function detectLongPauseFrequency(
	words: WordTiming[],
	durationSeconds: number,
): number {
	if (words.length < 2 || durationSeconds <= 0) {
		return 0;
	}

	let longPauseCount = 0;

	for (let i = 1; i < words.length; i += 1) {
		const gap = words[i].start - words[i - 1].end;
		if (gap >= 0.7) {
			longPauseCount += 1;
		}
	}

	const pausesPerMinute = (longPauseCount * 60) / durationSeconds;
	return round2(Math.max(0, pausesPerMinute));
}

function detectVoiceInstability(words: WordTiming[]): number {
	if (words.length < 2) {
		return 0;
	}

	const confidences = words.map((word) => word.confidence || 0.5);
	const average =
		confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
	const variance =
		confidences.reduce((sum, value) => sum + (value - average) ** 2, 0) /
		confidences.length;

	return round2(clamp01(Math.sqrt(variance) * 4.5));
}

function detectSpeechRate(
	words: WordTiming[],
	durationSeconds: number,
): number {
	if (durationSeconds <= 0) {
		return 0;
	}

	return round2(words.length / durationSeconds);
}

function detectLowVolumeScore(
	confidence: number,
	meanVolumeDb: number | undefined,
): number {
	const volumeFactor =
		meanVolumeDb === undefined ? 0.4 : clamp01((-28 - meanVolumeDb) / 16);
	const confidenceFactor = clamp01((0.92 - confidence) / 0.25);

	return round2(clamp01(volumeFactor * 0.65 + confidenceFactor * 0.35));
}

function calculateToneSummary(
	transcription: DeepgramTranscription,
	baseline: ToneBaseline | undefined,
	signalMetrics: AudioSignalMetrics,
): ToneSignalSummary {
	const speechRateWps = detectSpeechRate(
		transcription.words,
		transcription.durationSeconds,
	);
	const longPauseFrequency = detectLongPauseFrequency(
		transcription.words,
		transcription.durationSeconds,
	);
	const voiceInstability = detectVoiceInstability(transcription.words);
	const whisperLikelihood = extractWhisperLikelihood(
		transcription.confidence,
		signalMetrics.meanVolumeDb,
	);
	const lowVolumeScore = detectLowVolumeScore(
		transcription.confidence,
		signalMetrics.meanVolumeDb,
	);

	const baselineSpeechRate = baseline?.speechRateWps ?? 2.5;
	const baselinePauseFrequency = baseline?.longPauseFrequency ?? 1.1;
	const baselineLowVolume = baseline?.lowVolumeScore ?? 0.35;

	const abnormalFeatures: string[] = [];

	if (whisperLikelihood >= 0.65) {
		abnormalFeatures.push('whisper likelihood');
	}
	if (voiceInstability >= 0.62) {
		abnormalFeatures.push('voice instability');
	}
	if (longPauseFrequency - baselinePauseFrequency >= 1.4) {
		abnormalFeatures.push('hesitation pauses');
	}
	if (Math.abs(speechRateWps - baselineSpeechRate) >= 1.0) {
		abnormalFeatures.push('speech rate shift');
	}
	if (lowVolumeScore - baselineLowVolume >= 0.3) {
		abnormalFeatures.push('low volume');
	}

	const hasWhisperOrHesitation =
		abnormalFeatures.includes('whisper likelihood') ||
		abnormalFeatures.includes('hesitation pauses');
	const raisedConcern =
		abnormalFeatures.length >= 2 && hasWhisperOrHesitation;

	const explanation: string[] = [];
	if (abnormalFeatures.includes('whisper likelihood')) {
		explanation.push('Whisper likelihood is elevated versus baseline.');
	}
	if (abnormalFeatures.includes('hesitation pauses')) {
		explanation.push('Long pauses suggest increased hesitation.');
	}
	if (abnormalFeatures.includes('speech rate shift')) {
		explanation.push('Speech rate differs from baseline.');
	}
	if (abnormalFeatures.includes('low volume')) {
		explanation.push(
			'Volume is lower than expected for this speaker baseline.',
		);
	}
	if (abnormalFeatures.includes('voice instability')) {
		explanation.push('Voice stability appears reduced in this utterance.');
	}

	return {
		whisperLikelihood,
		voiceInstability,
		longPauseFrequency,
		speechRateWps,
		lowVolumeScore,
		abnormalFeatures,
		raisedConcern,
		explanation,
	};
}

function buildBaselineFromTone(
	toneSummary: ToneSignalSummary,
	reasonTag: string,
): ToneBaseline {
	return {
		speechRateWps: toneSummary.speechRateWps,
		longPauseFrequency: toneSummary.longPauseFrequency,
		lowVolumeScore: toneSummary.lowVolumeScore,
		capturedAt: new Date(),
		reasonTag,
	};
}

async function extractSignalMetrics(
	audioBuffer: Buffer,
	mimeType: string,
): Promise<AudioSignalMetrics> {
	const tempFile = path.join(
		os.tmpdir(),
		`beacon-audio-${randomUUID()}.${extensionFromMimeType(mimeType)}`,
	);

	await fs.writeFile(tempFile, audioBuffer);

	try {
		const { stderr } = await execFileAsync(FFMPEG_BIN, [
			'-i',
			tempFile,
			'-af',
			'volumedetect',
			'-f',
			'null',
			'-',
		]);

		const match = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
		return {
			meanVolumeDb: match ? Number(match[1]) : undefined,
		};
	} catch {
		return {};
	} finally {
		await fs.unlink(tempFile).catch(() => undefined);
	}
}

async function streamFluxTranscription(
	audioBuffer: Buffer,
	mimeType: string,
	deepgramApiKey: string,
): Promise<DeepgramTranscription> {
	const deepgram = createClient(deepgramApiKey);
	const tempFile = path.join(
		os.tmpdir(),
		`beacon-flux-${randomUUID()}.${extensionFromMimeType(mimeType)}`,
	);

	await fs.writeFile(tempFile, audioBuffer);

	try {
		const socket = deepgram.listen.live(CONNECTION_OPTIONS as any);

		let latestTranscript: DeepgramTranscription | null = null;
		let finalTranscript: DeepgramTranscription | null = null;
		let socketError: Error | null = null;
		let socketOpened = false;

		socket.on(LiveTranscriptionEvents.Open, () => {
			socketOpened = true;
		});

		socket.on(LiveTranscriptionEvents.Transcript, (data: unknown) => {
			const transcript = parseTranscriptPayload(data);
			if (!transcript) {
				return;
			}

			latestTranscript = transcript;

			const message = data as {
				event?: string;
				type?: string;
				is_final?: boolean;
				speech_final?: boolean;
			};

			if (
				message.event === 'EndOfTurn' ||
				message.type === LiveTranscriptionEvents.UtteranceEnd ||
				(message.type === 'Results' &&
					(Boolean(message.is_final) ||
						Boolean(message.speech_final)))
			) {
				finalTranscript = transcript;
			}
		});

		socket.on(LiveTranscriptionEvents.Error, (error: Error) => {
			socketError = error;
		});

		await new Promise<void>((resolve, reject) => {
			let didResolve = false;
			const openTimeout = setTimeout(() => {
				if (!didResolve) {
					reject(
						new Error(
							'Deepgram Flux connection did not open in time',
						),
					);
				}
			}, STREAM_TIMEOUT_MS);

			socket.on(LiveTranscriptionEvents.Open, () => {
				if (didResolve) {
					return;
				}
				didResolve = true;
				clearTimeout(openTimeout);
				resolve();
			});

			socket.on(LiveTranscriptionEvents.Error, (error: Error) => {
				if (didResolve) {
					return;
				}
				didResolve = true;
				clearTimeout(openTimeout);
				reject(error);
			});
		});

		if (!socketOpened) {
			throw new Error('Deepgram Flux socket failed to open');
		}

		const ffmpeg = spawn(FFMPEG_BIN, [
			'-loglevel',
			'quiet',
			'-i',
			tempFile,
			'-f',
			's16le',
			'-ar',
			'16000',
			'-ac',
			'1',
			'-',
		]);

		ffmpeg.stdout.on('data', (chunk: Buffer) => {
			socket.send(
				chunk.buffer.slice(
					chunk.byteOffset,
					chunk.byteOffset + chunk.byteLength,
				),
			);
		});

		let streamTimeout: NodeJS.Timeout | null = null;
		await Promise.race([
			new Promise<void>((resolve, reject) => {
				ffmpeg.on('error', reject);
				ffmpeg.on('close', resolve);
			}),
			new Promise<void>((_, reject) => {
				streamTimeout = setTimeout(() => {
					reject(
						new Error(
							'Voice processing timed out while using Deepgram Flux',
						),
					);
				}, STREAM_TIMEOUT_MS);
			}),
		]);
		if (streamTimeout) {
			clearTimeout(streamTimeout);
			streamTimeout = null;
		}

		socket.finalize();

		await new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS));
		socket.requestClose();

		if (socketError) {
			throw socketError;
		}

		const transcript = finalTranscript ?? latestTranscript;
		if (!transcript) {
			throw new Error('Deepgram returned no transcript');
		}

		return transcript;
	} finally {
		await fs.unlink(tempFile).catch(() => undefined);
	}
}

async function buildDeepgramResult(
	input: AnalyzeVoiceInput,
	deepgramApiKey: string,
): Promise<DeepgramTranscription> {
	if (!deepgramApiKey) {
		throw new Error('Deepgram API key is required');
	}

	return streamFluxTranscription(
		input.audioBuffer,
		input.mimeType,
		deepgramApiKey,
	);
}

export async function analyzeVoiceUtterance(
	input: AnalyzeVoiceInput,
	options: AnalyzeVoiceOptions,
): Promise<VoiceAnalysisResult> {
	const { deepgramApiKey, allowMockMode } = options;
	let transcription: DeepgramTranscription;

	if (deepgramApiKey) {
		transcription = await buildDeepgramResult(input, deepgramApiKey);
	} else if (allowMockMode) {
		transcription = buildMockResult(input);
	} else {
		throw new Error('VOICE_UNAVAILABLE');
	}

	const signalMetrics = await extractSignalMetrics(
		input.audioBuffer,
		input.mimeType,
	);
	const toneSignals =
		input.speaker === 'traveler'
			? calculateToneSummary(transcription, input.baseline, signalMetrics)
			: undefined;

	const blocked = transcription.confidence < BLOCK_THRESHOLD;
	const requiresManualConfirm =
		transcription.confidence >= BLOCK_THRESHOLD &&
		transcription.confidence < MANUAL_CONFIRM_THRESHOLD;
	const baseline =
		input.isBaselineCapture && toneSignals
			? buildBaselineFromTone(toneSignals, input.reasonTag ?? 'initial')
			: undefined;

	return {
		transcriptOriginal: transcription.transcriptOriginal,
		transcriptForAnalysis: transcription.transcriptForAnalysis,
		detectedLanguage: transcription.detectedLanguage,
		confidence: round2(transcription.confidence),
		blocked,
		requiresManualConfirm,
		blockReason: blocked
			? 'Transcription confidence is below 0.80. Retry voice capture or enter text manually.'
			: undefined,
		speaker: input.speaker,
		toneSignals,
		baselineCaptured: Boolean(baseline),
		baseline,
	};
}
