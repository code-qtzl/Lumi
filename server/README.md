# Lumi App — Server

Express.js API server for Lumi App.

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

```bash
npm install
```

### Running the Server

```bash
npm run server
```

The server will be available at `http://localhost:3000`

## API Endpoints

- `POST /sessions` - Create an interview session
- `POST /sessions/:id/messages` - Add a text or voice-confirmed message
- `POST /sessions/:id/voice/analyze` - Transcribe a push-to-talk utterance with Deepgram Flux
- `POST /sessions/:id/risk-override` - Apply an officer override with audit logging
- `POST /sessions/:id/check-guardrails` - Review a question for trauma-informed guardrails
- `PUT /sessions/:id` - Update session notes

### Local Environment

Copy `server/.env.example` to `server/.env` and add your Deepgram key.

- `DEEPGRAM_API_KEY` is required for real voice transcription
- `DEEPGRAM_MODEL` defaults to `flux-general-en`
- `DEEPGRAM_EOT_THRESHOLD` defaults to `0.7`
- `DEEPGRAM_EOT_TIMEOUT_MS` defaults to `5000`
- `BEACON_VOICE_MOCK_MODE=true` enables mock voice results for local/dev runs when the API key is absent
- `BEACON_VOICE_STREAM_TIMEOUT_MS` defaults to `6000`
- `BEACON_VOICE_FLUSH_TIMEOUT_MS` defaults to `1200`
- `BEACON_FFMPEG_BIN` defaults to `ffmpeg`

## Client Connection

This backend serves a React client application. For client setup instructions, see the [Client README](../client/README.md).
