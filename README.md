# Lumi — Training Simulator

An AI-powered training simulator for frontline professionals to practice recognizing human trafficking behavioral indicators through role-play scenarios. Built for the [**Call for Code AI Hackathon**](https://hackathon.austinaihub.org/#workshop-resources).

A trainee conducts a text interview with an AI-played traveler persona. When ready, they commit a **refer** or **no action** decision and receive a scored debrief across 5 rubric dimensions.

---

## Quick Start

### Option A — No API key (fixture mode, for dev and testing purpose only)

```bash
# terminal 1 — server on :3000
cd server
npm install && npm run server

# terminal 2 — client on :5173
cd client
npm install && npm run dev
```

Open **http://localhost:5173**

Fixture mode uses canned replies — great for verifying the UI works.

### Option B — Groq (recommended / free tier)

Create `server/.env` from the example:

```bash
cd server
cp .env.example .env
```

Set your Groq key and preferred model:

```env
GROQ_API_KEY=set_your_key_here
TRAVELER_MODEL=llama-3.3-70b-versatile
```

The server log will confirm:
```
[traveler] engine: groq (llama-3.3-70b-versatile)
```

Groq's free tier serves Llama-class models via an OpenAI-compatible endpoint — no paid account needed.

### Option C — Ollama (local, $0)

Install Ollama (once):

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

Then download a model and start the server:

```bash
# Download model (run once)
ollama pull llama3.3

# In server/.env:
OLLAMA_MODEL=llama3.3
# OLLAMA_BASE_URL=http://localhost:11434/v1  # default; change if remote
```

### Option D — Docker

Install Docker Desktop if you don't have it:

```bash
# macOS
brew install --cask docker

# Or download from https://www.docker.com/products/docker-desktop/
```

Then build and run:

```bash
docker compose build
docker compose up
```

Open **http://localhost:5174**

> **Note:** Docker runs in fixture mode by default (no API key needed). The server and client containers are named `lumi-server` and `lumi-client`.

---

## Known limitations (hackathon build)

- **Free-tier rate limits.** Live sessions run on Groq's free tier (12k
  tokens/min). Under sustained load a turn can be rate-limited: you'll see
  "traveler temporarily unavailable — send your question again." This is by
  design — Lumi never substitutes canned replies mid-session, because scored
  feedback must reflect a real model conversation. A paid key to a
  higher-tier model removes the ceiling with no code changes (the provider
  is an env-level seam: Groq / OpenAI / any OpenAI-compatible host / Gemini),
  and local Ollama runs with no rate limits at all.
- Voice output is designed but descoped for v1 (see `docs/lumi-prd.md`).

## How It Works

```
Start a session  →  Interview the traveler  →  Make a decision  →  See your debrief
```

| Step | What happens |
|---|---|
| **Home** | Cover page with two actions: **Start Session** and **View History**. Scenarios are assigned blind — the trainee never sees or picks what they're walking into (even the title is withheld until the debrief) |
| **Session workspace** | Three-panel layout: **training tips** (left — what to pay attention to, drawn from the indicator catalog and rubric), the **interview chat** (center), and a **notes pad** (right, autosaved per session). Soft nudge at 20 questions, hard stop at 30 — but the session only ends with your decision |
| **Decision** | Type an optional reason, then click **No Action** or **Refer** |
| **Debrief** | Rubric scores (1–5) across 5 dimensions — every claim links to the exact transcript moment (clickable anchors), **better questions you could have asked** at each flagged turn, the full transcript, and the scenario reveal |
| **Training History** | Calendar of practice days, totals, correct-decision rate, and a score trend across sessions — reachable from Home or straight from any debrief |

Dark and light themes are supported throughout (toggle in the header).

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/scenarios` | List all scenarios |
| `GET` | `/api/scenarios/:id` | Trainee-safe view (no ground truth) |
| `POST` | `/api/scenarios` | Create a scenario (validated against the shared contract) |
| `POST` | `/api/sessions` | Start a session; traveler speaks first |
| `POST` | `/api/sessions/:id/turn` | Submit a turn, get traveler reply |
| `POST` | `/api/sessions/:id/end` | Commit decision, get transcript |
| `GET` | `/api/sessions/:id/transcript` | Fetch completed transcript |
| `GET` | `/api/sessions/:id/reveal` | Full card + reveal — completed sessions only |
| `GET` | `/api/sessions/:id` | Session view or transcript |
| `POST` | `/api/sessions/:id/feedback` | Score session → FeedbackReport |
| `GET` | `/api/sessions/:id/feedback` | Retrieve cached report |
| `GET` | `/api/traces` | Session lifecycle events |

---

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in what you need.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `GROQ_API_KEY` | — | **Recommended.** Groq free tier — serves Llama-class models via OpenAI-compatible endpoint. |
| `TRAVELER_MODEL` | `llama-3.3-70b-versatile` | Pinned role-play model (recorded in traces). |
| `OLLAMA_MODEL` | — | Set to enable local Ollama (e.g. `llama3.3`). |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Override for remote Ollama. |
| `OPENAI_API_KEY` | — | OpenAI (paid). Falls back to `gpt-4o-mini`. |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use. |
| `TRAVELER_API_KEY` | — | Any OpenAI-compatible host (both key + base required). |
| `TRAVELER_API_BASE` | — | Base URL for the compatible host. |
| `GEMINI_API_KEY` | — | Gemini (free-tier rate limits are tight). |
| `ALLOWED_ORIGIN` | `*` | CORS origin (set to your frontend URL in prod). |
| `RATE_LIMIT_MAX` | `20` | Max session creations per IP per minute. |
| `PROBE_TURN_DELAY_MS` | auto | Pacing between turns (ms). Groq free tier tokens/min limited. |

**Traveler model choice precedence:** `GROQ_API_KEY` → `OLLAMA_MODEL` → `OPENAI_API_KEY` → `TRAVELER_API_*` → `GEMINI_API_KEY` → fixture

---

## Project Structure

```
├── client/                        # React 19 + TypeScript + Vite (port 5173)
│   └── src/
│       ├── api.ts                 # Typed API client
│       └── App.tsx                # 3-view training simulator UI
│
├── server/                        # Express + ts-node (port 3000)
│   └── src/
│       ├── app.ts                 # Express app (middleware + routes)
│       ├── server.ts              # Entry point (listen)
│       ├── routes/                # scenarios, sessions, feedback, traces
│       ├── session/               # Engine, store, types
│       ├── traveler/              # Groq / Ollama / OpenAI (compat) / Gemini / fixture
│       ├── eval/                  # Rubric scorer + harness + labeled set
│       ├── probes/                # Role-play probe suites + differential
│       ├── feedback/              # Feedback report store
│       ├── scenarios/             # Scenario card registry
│       ├── variations/            # Variation generator + invariance checker
│       └── tracing/               # Session event tracer
│
└── shared/
    └── contracts/                 # JSON schemas + rubric + indicator catalog + examples
```

---

## Running Tests

```bash
cd server
npm test          # ~125+ tests
npm run typecheck
```

---

## Development Notes

- **Groq free tier** is the recommended AI backend for shared/live work. Sign up at https://console.groq.com.
- **Ollama** provides unlimited local iteration at $0 cost. Run `ollama pull llama3.3` and set `OLLAMA_MODEL` in `.env`.
- The server runs keyless in fixture mode — no API key needed for UI testing.
- Session data persists to disk (write-through JSON). Sessions survive server restarts.
- All routes are rate-limited. Adjust `RATE_LIMIT_MAX` in `.env` as needed.
