# Beacon App: Trauma-Informed Risk Scoring Tool

A web-based AI assistant for airport and transit officers that guides trauma-informed questioning, analyzes responses, assigns risk levels, and recommends safe next steps or escalation when needed.

## Overview

**Beacon** is a decision-support tool designed to help officers conduct trauma-informed interviews while identifying potential risk indicators related to human trafficking and exploitation. It combines:

- **Conversational Interface**: Officers enter observations and traveler responses in a chat-like format
- **Real-Time Risk Analysis**: AI analyzes for trafficking indicators across 6 key categories
- **Risk Scoring**: Assigns risk levels (Safe/Risky/Unsafe) with confidence scores
- **Guardrails**: Prevents harmful questioning and suggests trauma-informed alternatives
- **Professional Dashboard**: Session status, quick reference guidance, and case notes
- **Warm, Calm Design**: Navy/slate theme positions this as a supportive tool, not an accusation engine

## Features

### Risk Indicators

Analyzes for indicators in these categories:

- **Travel Control**: Document control, itinerary concerns
- **Document Control**: Passport/visa issues, third-party control
- **Coercion Indicators**: Threats, pressure, debt bondage
- **Inconsistent Story**: Narrative gaps, confusion
- **Vulnerable Person**: Minors, elderly, disabled travelers
- **Urgent Safety Concern**: Immediate threats requiring escalation

### Officer Dashboard

- Session status and timeline
- Risk indicator summary
- Session notes (persisted)
- Trauma-informed guidance reference

### Conversation Panel

- Chat-style message interface
- Officer observations and traveler responses
- Real-time risk assessment display
- AI-generated guidance and follow-up suggestions

### Risk Assessment Card

- Real-time risk level display (Safe/Risky/Unsafe)
- Confidence score (0-100%)
- Categorized risk indicators with evidence
- Escalation recommendations
- Quick-reference guidance

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Express, TypeScript
- **API**: REST endpoints + Deepgram Flux voice streaming
- **Styling**: CSS with design system tokens (navy blue theme)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies for both server and client
npm run install:all
```

### Environment Setup

Copy the example files before running the app:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

- `server/.env` needs `DEEPGRAM_API_KEY`
- `server/.env` can set `BEACON_VOICE_MOCK_MODE=true` for local development without Deepgram
- `client/.env` can override `VITE_API_BASE_URL` if the API is not on `http://localhost:3000`

### Running the Application

**Terminal 1 - Start the Backend Server:**

```bash
cd server
npm run server
# Server runs on http://localhost:3000
```

**Terminal 2 - Start the Frontend Dev Server:**

```bash
cd client
npm run dev
# Client runs on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## API Endpoints

### Sessions

- `POST /sessions` - Create a new interview session
    - Body: `{ officerName: string }`
    - Returns: `InterviewSession`

- `GET /sessions/:id` - Get session details
    - Returns: `InterviewSession`

- `PUT /sessions/:id` - Update session notes
    - Body: `{ notes: string }`
    - Returns: `InterviewSession`

### Messages & Analysis

- `POST /sessions/:id/messages` - Send officer observation/response
    - Body: `{ content: string }`
    - Returns: `{ message, riskAssessment, assistantMessage, sessionUpdated }`

- `POST /sessions/:id/voice/analyze` - Push-to-talk voice analysis using Deepgram Flux
    - Multipart form fields: `audio`, `speaker`, `isBaselineCapture`, `reasonTag`
    - Returns: transcript, confidence, tone signals, and baseline capture metadata

- `POST /sessions/:id/risk-override` - Override a message risk level with audit logging
    - Body: `{ messageId, nextLevel, justification, supervisorAcknowledged }`

- `POST /sessions/:id/check-guardrails` - Validate question for guardrails
    - Body: `{ question: string }`
    - Returns: `GuardrailFeedback`

## Risk Scoring Algorithm

The system analyzes messages for keywords in each category and assigns:

- **Risk Score**: Incremented based on matched keywords and severity
- **Risk Level**:
    - Safe (0-3 points)
    - Risky (4-7 points)
    - Unsafe (8+ points or urgent keywords)
- **Confidence**: Based on keyword matches and situation urgency

### Example Keywords by Category

**Travel Control**

- "someone else has", "not my passport", "borrowed", "itinerary planned by"

**Document Control**

- "passport held by", "documents taken", "visa issues"

**Coercion**

- "threatened", "forced", "family pressure", "debt", "promised"

**Inconsistency**

- "don't know", "confused about", "different story"

**Vulnerable Person**

- "child", "minor", "elderly", "pregnant", "alone"

**Urgent Safety**

- "immediate threat", "danger", "emergency", "in danger", "trafficking"

## Design System

The application uses a warm, professional design system with:

**Color Palette**

- **Primary**: Navy blue (#1B4965) - authority and calm
- **Background**: Warm off-white (#FAF7F2)
- **Accents**: Green (safe), Amber (caution), Red (urgent)
- **Text**: Dark charcoal (#2C2A28)

**Typography**

- **Display**: Bricolage Grotesque (bold, distinctive)
- **Body**: DM Sans (readable, professional)
- **Mono**: JetBrains Mono (code)

**Principles**

- Calm, non-alarming interface
- Professional decision-support tool aesthetic
- Accessibility and clarity prioritized
- Generous whitespace and clear hierarchy

## Usage Flow

1. **Officer Starts Session** - Enters their name to initialize
2. **Officer Enters Observations** - Types initial notes about traveler
3. **AI Analyzes** - System scores for risk indicators
4. **Dashboard Updates** - Risk level, indicators, and recommendations displayed
5. **Continues Questioning** - Officer enters follow-up observations
6. **Escalation** - System recommends immediate escalation if unsafe indicators detected
7. **Session Notes** - Officer documents observations and next steps

## Diagrams

- Combined diagrams page: [docs/diagrams.md](docs/diagrams.md)
- Mermaid source files:
    - [docs/user-flow.mmd](docs/user-flow.mmd)
    - [docs/technical-architecture.mmd](docs/technical-architecture.mmd)
    - [docs/process-sequence.mmd](docs/process-sequence.mmd)
    - [docs/risk-state.mmd](docs/risk-state.mmd)

## Trauma-Informed Principles

- **Listen without judgment**: Focus on understanding the traveler's experience
- **Avoid accusatory language**: Questions are phrased as observations, not accusations
- **Respect autonomy**: Recognize decision-making capacity
- **Offer breaks**: Allow pauses in conversation
- **Escalate appropriately**: Route urgent concerns to proper authorities

## Future Enhancements

- Audio input via Deepgram Flux ASR for hands-free note taking
- Multi-language support
- Advanced NLP model integration
- Supervisor dashboard for case management
- Integration with law enforcement reporting systems
- Training module for new officers
- Analytics dashboard for trends

## Security & Privacy

- Session data is stored in-memory (development mode)
- No personal information is logged beyond session
- Officers maintain full control of case notes
- Escalation recommendations don't automatically report

## License

[Specify your license here]
