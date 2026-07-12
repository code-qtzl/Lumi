# Lumi — Training Simulator

An AI-powered training simulator for frontline professionals to practice recognising human trafficking behavioral indicators through role-play scenarios. Built for the **Call for Code AI Hackathon**.

A trainee conducts a text interview with an AI-played traveler persona. When ready, they commit a **refer** or **no action** decision and receive a scored debrief across 5 rubric dimensions.

---

## Quick Start

### Option A — No API key (fixture mode, works immediately)

```bash
# install all deps from the repo root
npm run install:all

# terminal 1 — server on :3000
cd server
npm run server

# terminal 2 — client on :5173
cd client
npm run dev
```

Open **http://localhost:5173**

### Option B — With OpenAI (real AI responses)

```bash
cd server
Copy-Item .env.example .env   # Windows
# cp .env.example .env        # Mac/Linux
```

Edit `server/.env` and set:
```
OPENAI_API_KEY=sk-proj-your_key_here
```

Then start both terminals as above. The startup log will confirm:
```
[traveler] engine: gpt-4o-mini
```

### Option C — Docker

```bash
docker compose up --build
```

Open **http://localhost:5173**

---

## How It Works

```
Pick a scenario  →  Interview the traveler  →  Make a decision  →  See your debrief
```

| Step | What happens |
|---|---|
| **Scenario list** | Choose a practice scenario (difficulty 1–3) |
| **Session chat** | Type questions; the AI traveler responds based on their persona and backstory |
| **Decision** | Type an optional reason, then click **No Action** or **Refer** |
| **Debrief** | Rubric scores (1–5) across 5 dimensions, decision outcome, and teaching points |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/scenarios` | List all scenarios |
| `GET` | `/api/scenarios/:id` | Trainee-safe view (no ground truth) |
| `GET` | `/api/scenarios/:id/reveal` | Full card with reveal — debrief only |
| `POST` | `/api/scenarios` | Create a scenario (Zod validated) |
| `POST` | `/api/auth/token` | Mint a JWT `{ trainee_id }` |
| `POST` | `/api/sessions` | Start a session; traveler speaks first |
| `POST` | `/api/sessions/:id/turn` | Submit a turn, get traveler reply |
| `POST` | `/api/sessions/:id/end` | Commit decision, get transcript |
| `GET` | `/api/sessions/:id/transcript` | Fetch completed transcript |
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
| `OPENAI_API_KEY` | — | Enables GPT traveler. Priority over Gemini. |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use |
| `GEMINI_API_KEY` | — | Enables Gemini traveler (fallback to OpenAI) |
| `JWT_SECRET` | — | Enables JWT auth. Leave blank for open dev mode. |
| `JWT_EXPIRY` | `8h` | Token lifetime |
| `ALLOWED_ORIGIN` | `*` | CORS origin (set to your frontend URL in prod) |
| `RATE_LIMIT_MAX` | `20` | Max session creations per IP per minute |

**Traveler priority:** `OPENAI_API_KEY` → `GEMINI_API_KEY` → fixture (no key needed)

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
│       ├── contracts.ts           # Shared TypeScript types
│       ├── app.ts                 # Express app (middleware + routes)
│       ├── server.ts              # Entry point (listen)
│       ├── routes/                # scenarios, sessions, feedback, auth, traces
│       ├── session/               # Engine, store, types
│       ├── traveler/              # OpenAI / Gemini / fixture engines
│       ├── eval/                  # Rubric scorer + harness
│       ├── feedback/              # Feedback report store
│       ├── middleware/            # JWT auth
│       ├── scenarios/             # Scenario card registry
│       └── tracing/               # Session event tracer
│
└── shared/
    └── contracts/                 # JSON schemas + rubric + indicator catalog
```

---

## Running Tests

```bash
cd server
npm test          # 82 tests across 5 files
npm run typecheck
```

---

## Recent Changes

| # | What was added | Files |
|---|---|---|
| 1 | **Feedback endpoint** — scores session against 5 rubric dimensions, idempotent, cached | `routes/feedback.ts`, `feedback/store.ts` |
| 2 | **Transcript GET** — dedicated endpoint for completed session transcripts | `routes/sessions.ts` |
| 3 | **JWT auth** — optional token-based auth, transparent in dev | `middleware/auth.ts`, `routes/auth.ts` |
| 4 | **CORS lockdown** — `ALLOWED_ORIGIN` env var | `app.ts` |
| 5 | **Rate limiting** — `express-rate-limit` on session creation | `app.ts` |
| 6 | **Session persistence** — write-through JSON file; sessions survive restarts | `session/store.ts` |
| 7 | **OpenAI traveler** — GPT-4o-mini via REST, no SDK; priority over Gemini | `traveler/openai.ts`, `traveler/index.ts` |
| 8 | **Improved fixture traveler** — topic-aware replies, rotating pool; no more stuck loops | `traveler/fixture.ts` |
| 9 | **Frontend training simulator** — 3-view app replacing placeholder message board | `client/src/App.tsx`, `client/src/api.ts` |
| 10 | **82 tests** — scenarios CRUD, session HTTP routes, feedback, scorer unit tests | `*.test.ts` files |
| 11 | **Error handler** — global middleware; no stack trace leaks | `app.ts` |
| 12 | **`.env.example` audit** — all new vars documented | `server/.env.example` |

