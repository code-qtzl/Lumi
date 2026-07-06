import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
	Speaker,
	ToneBaseline,
	ToneSignalSummary,
	VoiceAnalysisResult,
} from './types';

const execFileAsync = promisify(execFile);

const DEEPGRAM_URL =
	'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&detect_language=true';
const BLOCK_THRESHOLD = 0.8;
const MANUAL_CONFIRM_THRESHOLD = 0.88;

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

	const confidences = words.map((w) => w.confidence || 0.5);
	const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
	const variance =
		confidences.reduce((sum, c) => sum + (c - avg) ** 2, 0) /
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

async function runDeepgramRequest(
	audioBuffer: Buffer,
	mimeType: string,
	deepgramApiKey: string,
): Promise<DeepgramTranscription> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 6000);

	try {
		const response = await fetch(DEEPGRAM_URL, {
			method: 'POST',
			headers: {
				Authorization: `Token ${deepgramApiKey}`,
				'Content-Type': mimeType,
			},
			body: new Uint8Array(audioBuffer),
			signal: controller.signal,
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Deepgram error (${response.status}): ${body}`);
		}

		const payload = (await response.json()) as any;
		const channel = payload?.results?.channels?.[0];
		const alternative = channel?.alternatives?.[0];
		const wordsRaw = Array.isArray(alternative?.words)
			? alternative.words
			: [];

		const transcriptOriginal = (alternative?.transcript ?? '').trim();
		const confidence = Number(alternative?.confidence ?? 0);
		const detectedLanguage = sanitizeLanguage(channel?.detected_language);
		const durationSeconds = Number(payload?.metadata?.duration ?? 0) || 0;

		const words: WordTiming[] = wordsRaw.map((word: any) => ({
			word: String(word.word ?? ''),
			start: Number(word.start ?? 0),
			end: Number(word.end ?? 0),
			confidence: Number(word.confidence ?? confidence),
		}));

		return {
			transcriptOriginal,
			transcriptForAnalysis: transcriptOriginal,
			detectedLanguage,
			confidence,
			words,
			durationSeconds,
		};
	} finally {
		clearTimeout(timer);
	}
}

function parseVolumeOutput(stderr: string): number | undefined {
	const match = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
	if (!match) {
		return undefined;
	}

	return Number(match[1]);
}

function extensionFromMimeType(mimeType: string): string {
	if (mimeType.includes('webm')) {
		return 'webm';
	}
	if (mimeType.includes('ogg')) {
		return 'ogg';
	}
	if (mimeType.includes('wav')) {
		return 'wav';
	}
	if (mimeType.includes('mp4')) {
		return 'mp4';
	}

	return 'dat';
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
		const { stderr } = await execFileAsync('ffmpeg', [
			'-i',
			tempFile,
			'-af',
			'volumedetect',
			'-f',
			'null',
			'-',
		]);

		return {
			meanVolumeDb: parseVolumeOutput(stderr),
		};
	} catch {
		return {};
	} finally {
		await fs.unlink(tempFile).catch(() => undefined);
	}
}

export async function analyzeVoiceUtterance(
	input: AnalyzeVoiceInput,
	options: AnalyzeVoiceOptions,
): Promise<VoiceAnalysisResult & { baseline?: ToneBaseline }> {
	const { deepgramApiKey, allowMockMode } = options;

	let transcription: DeepgramTranscription;

	if (deepgramApiKey) {
		transcription = await runDeepgramRequest(
			input.audioBuffer,
			input.mimeType,
			deepgramApiKey,
		);
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
