# Lumi — PRD (v1)

_Builds on `lumi-product-vision.md`. Name confirmed: Lumi (repo `code-qtzl/Lumi`)._

> **v1 status (2026-07-13):** implemented and verified except where marked.
> Scope decision 7/13: **voice output (U6/F8/AC8) descoped from v1** — the
> text loop outranked voice (roadmap standing rule); text-only is a designed
> state, not a degradation (see F8 fallbacks). Role-play model: Groq
> Llama-3.3-70B free tier, with local Ollama as the $0 offline lane and a
> keyless fixture mode (F7). Per-criterion status in §5.

## 0. Terms

- **Archetype** — a scenario definition with fixed ground truth: trafficking or
  innocent, which indicators are present, and the pedagogical point. Authored once.
- **Scenario / variation** — a playable instance of an archetype. Surface details
  (names, route, presentation) differ per variation; the ground truth never does.
- **Session** — one complete practice run: trainee interviews the traveler, commits to
  a decision, gets the debrief.
- **Transcript** — the recorded conversation, as ordered turns with stable IDs.
- **Anchor** — a turn ID that a feedback claim points at. Every claim must have one;
  "you asked a leading question" always names the exact moment.
- **Rubric dimension** — one of the five scored skills: open questions, trauma-informed
  language, indicator recognition, false-positive discipline, referral protocol.
- **Indicator** — a behavioral (never demographic) sign from our shared catalog, e.g.
  "companion answers for the traveler."
- **Debrief** — the post-session screen: dimension scores with anchors, better
  questions the trainee could have asked, and the scenario reveal.

## 1. Personas

- **Riya, secondary-inspection officer** — conducts formal multi-turn interviews;
  has referral authority; highest-stakes first contact.
- **Sam, gate agent** — brief incidental encounters; job is notice-and-refer, not
  questioning.

One skill core, different settings and referral protocols. Each scenario declares
which setting it plays in.

## 2. User stories

### v1 (required)

- **U1 — Start a session.** As a trainee, I am given a traveler whose situation I
  don't know, so that practice feels like the real encounter. _(v1: the scenario is
  assigned blind and hidden — the trainee never sees or picks from the scenario
  pool; even the scenario title is withheld until the debrief, since a title alone
  can reveal the archetype.)_
- **U2 — Interview.** As a trainee, I exchange messages with the traveler, who responds
  in character and reacts realistically to my technique (opens up to open questions,
  shuts down under accusation), so my choices have visible consequences.
- **U3 — Commit to a decision.** As a trainee, I must end the session by choosing
  refer / no-action (with an optional one-line reason), so I practice making the actual
  judgment, not just chatting.
- **U4 — Debrief.** As a trainee, I get rubric scores where every claim links to a
  specific moment in my transcript, the better question I could have asked at each
  flagged moment, and what was actually going on — so I trust the feedback and know
  what to change.
- **U5 — Replay without memorizing.** As a trainee, I can replay an archetype and get a
  different surface (names, route, presentation), so I can't game the scenario.
- **U6 — Hear the traveler. [DESCOPED v1 → fast-follow]** As a trainee, the traveler
  speaks with realistic emotional tone (voice out; I still type), so I practice
  reading tone — the signal that makes this training real — not just words.
  _(Team decision 7/13: v1 ships text-only for cost and schedule; the engine keeps
  the voice seam — every turn carries `audio_ref: null` from one code path — so
  voice-out slots in without engine changes.)_

  _Why voice-out + typed input beats text/text — and isn't worse for being asymmetric:_
  the rubric scores question formulation, which typing doesn't degrade (and typing
  gives novices thinking time — scaffolding, not a bug). Voice-out adds the
  tone-reading skill on top; nothing text/text offers is lost. The hear-then-respond
  pattern is standard in language-learning tools. Full spoken realism (time pressure,
  speaking your questions) is what voice-in adds later.

### Internal stories (build-team users, v1)

_These actors are us, not trainees — but their workflows gate what trainees get.
If authoring and evaluation aren't first-class, content doesn't scale and feedback
can't be trusted; they're in the PRD so they get built, not improvised._

- **U7 — Author an archetype.** As a content author, I define an archetype (ground
  truth, indicators, role-play direction) once and the system generates valid
  variations, so content scales past hand-writing.
- **U8 — Trust but verify.** As the eval owner, I can run the eval harness on any
  batch of feedback reports and get faithfulness numbers, so we know whether the
  feedback engine is trustworthy before trainees see it.

### Fast-follow (designed-for, not built in v1)

- **U9 — Competency profile.** As a trainee, I see my technique trend across sessions
  (private to me).
- **U10 — Training that adapts.** As a trainee, my next scenarios are picked to target
  my weak dimensions (e.g., more innocent scenarios if my false-positive discipline
  lags), so practice time goes where it helps most.

### Out of scope v1 (in priority order for later)

1. **Voice input** — trainee speaks. Highest future value (full conversational
   realism) but realtime audio plumbing + an unresolved transport decision.
2. **Multi-language** — trafficking is cross-border by nature and encounters are
   multilingual; big reach win, but content, rubric calibration, and eval all
   multiply per language.
3. **Org/instructor dashboards** — how training programs would actually deploy;
   needs the aggregate-anonymous design to be done right (worker-surveillance risk).
4. **Accounts/auth** — v1 is single local user; accounts only matter once
   dashboards/multi-user exist.
5. **LMS integration** — the distribution channel for real adoption; pointless
   until the above exist.

## 3. Functional requirements

**F1 — Scenario runtime.** Loads scenario cards (contract: `scenario-card.schema.json`);
maintains hidden state; assembles transcript (contract: `transcript.schema.json`).

**F2 — Role-play agent.** LLM-driven traveler constrained by the card. Must: stay in
character, exhibit the card's `emotional_presentation`, respond differentially to open
vs. leading/accusatory questions, voice `companion` turns where the card includes one,
and never reveal ground truth mid-session.

**F3 — Variation generator.** Given an archetype card, produces variant scenario cards.
Variable: surface fields (names, route, ages-within-band, phrasing) and — for the
trafficking archetype — `emotional_presentation`, including the coached-victim
presentation (rehearsed story, fearful deference). Invariant: `type`,
`indicators_present`, pedagogical intent. Validity requirements are acceptance
criterion 3.

**F4 — Feedback engine.** Consumes transcript + scenario card + rubric; produces
feedback report (contract: `feedback-report.schema.json`): all 5 dimensions scored
1–5, every claim anchored to turn_ids, decision-vs-ground-truth outcome, and modeled
alternatives — every flagged trainee turn gets the better question with a one-line why
(the evidence-backed "modeling" that outperforms feedback alone).

**F5 — Debrief UI.** Renders transcript with anchor highlighting (click a claim → jump
to the moment), dimension scores, modeled alternatives, scenario reveal.

**F6 — Session mechanics.** Fixed decision point: session ends only via U3 decision.
Soft nudge at 20 trainee turns ("consider deciding"), hard stop at 30 (research anchor:
effective training = several short interviews + feedback per ~1-hour session; child-
interview paradigm averages ~35 questions, ours targets 10–20).

**F7 — Fixture mode.** App fully runnable against the contract examples (no API keys)
for development, review, and demo fallback. Fixture mode is text-only.

**F8 — Voice output. [DESCOPED v1]** Each traveler turn is rendered to speech via per-turn expressive
TTS honoring the card's `voice_direction` (no realtime/duplex audio — trainee types);
audio stored and referenced via the transcript's `audio_ref`. v1 archetypes must
therefore include `voice_direction` (schema keeps it optional for text-only content).

*Listen-first:* during the session, the traveler's text is NOT shown while audio plays —
transcript text for a turn reveals after playback ends (with a replay button), so
trainees practice listening rather than reading. Accessibility toggle ("always show
captions") available in settings; the debrief always shows the full transcript.

*Fallback paths (each keeps the session alive; none lose data):*
- **Single TTS call fails or exceeds 8s** → show that turn as text immediately,
  `audio_ref: null`, continue in voice mode.
- **3 consecutive TTS failures** → switch the remainder of the session to text mode,
  tell the trainee unobtrusively, keep already-generated audio.
- **No TTS key / quota exhausted at session start** → session starts in text mode with
  a visible notice; no dead air.
- **Client playback failure** (autoplay blocked, no audio device) → per-turn "show
  text" control always present; audio remains replayable from the debrief.
- **Fixture mode** → always text-only (F7).

## 4. Non-functional requirements

- **Latency:** traveler reply p50 ≤ 2s, p95 ≤ 5s for text (Flash-class TTFT is ~0.6s
  and a 1–2 sentence reply streams in well under 2s); with voice out, audio starts
  playing p50 ≤ 4s, p95 ≤ 8s (adds one TTS call). Debrief generation ≤ 30s with a
  progress state.
- **Cost:** ≤ $0.20 per complete session with voice out (text portion est.
  ~$0.03–0.05 at Flash-class pricing; TTS ~$0.05–0.15); ≤ $0.10 text-only.
- **Safety (testable, not aspirational):** no demographic/protected-attribute features
  in prompts, scoring, or generator variation axes (nationality never varies as a
  signal); feedback engine rejects/regenerates reports failing anchor validity; no
  output anywhere describes a real person.
- **Privacy:** transcripts and reports stored locally per trainee; no third-party
  analytics.
- **Demo reliability:** golden-path scenario runs 10/10 times without intervention.

## 5. Acceptance criteria

1. **Anchor validity: 100%.** Every feedback claim's turn_ids exist and quoted text
   matches the transcript. Automatic check on every report; failures are regenerated,
   never shown.
2. **Reviewed-label agreement: ≥80%** of dimension scores within ±1 of the reference
   label on a labeled set of ≥10 sessions (mix of good/bad technique, both archetypes).
   Reference labels are model-drafted from public interviewing/training guidance, then
   human-reviewed and corrected by a teammate before use.
3. **Variation generator: 100%** of variants schema-valid and ground-truth-invariant
   (passes `validate.py` + invariance check vs. parent archetype); **≥8 usable variants
   per archetype** for submission, including ≥1 coached-victim presentation of the
   trafficking archetype.
4. **Both archetypes** (1 trafficking, 1 innocent) playable end-to-end including
   debrief; innocent scenario demonstrably scoreable (false-positive discipline
   dimension produces meaningful feedback, not N/A).
5. **Modeled alternatives present:** every dimension scored ≤3 carries at least one
   modeled alternative tied to a flagged turn.
6. **Session mechanics enforced:** cannot end without a decision; caps trigger at
   20/30.
7. **Fixture mode** passes the full user journey with no network access.
8. **[DESCOPED v1] Voice out works on both archetypes:** every traveler turn plays audio in a normal
   session; delivery audibly matches the card's presentation label (team ear-check);
   listen-first enforced (turn text hidden until playback ends, captions toggle works);
   each F8 fallback path exercised at least once (kill the key, block a call) without
   breaking the session.

### v1 acceptance status (verified 2026-07-13)

| AC | Status | Evidence |
|---|---|---|
| 1 — Anchor validity 100% | ✅ enforced | automatic gate in scorer + `npm run eval` exits non-zero on any invalid anchor; modeled-alternative turn refs checked too |
| 2 — Label agreement ≥80% | ✅ 10/10 within ±1 (n=10) | labeled set grown from failures per the accretive rule; two reference labels corrected during review to match rubric semantics (FP-discipline is N/A on trafficking cards). Caveat stands: rule-based scorer, self-authored set — treat as scaffolding validation, not expert agreement |
| 3 — Variation generator | ✅ 16/16 valid | 8 per archetype incl. coached presentations; every variant passes schema + invariance gates; generated cards load into the live pool (U5) |
| 4 — Both archetypes E2E | ✅ | blind assignment draws from the full pool; debrief incl. FP-discipline feedback on innocent scenarios |
| 5 — Modeled alternatives | ✅ enforced | every dimension ≤3 carries an alternative tied to a flagged turn; gated in `npm run eval` |
| 6 — Session mechanics | ✅ tested | decision gate survives the 30-turn hard cap; nudge at 20; unit + route tests |
| 7 — Fixture mode | ✅ | full journey keyless; fixture is also the per-turn fallback so a live session never dies on an LLM failure |
| 8 — Voice out | ⬜ descoped | team decision 7/13; F8 fallback design makes text-only a first-class state |

Additional v1 evals beyond the ACs: live never-reveal suite (10/10 adversarial
turns held on both archetypes), differential-behavior regression (disclosure gap
present on both archetypes, traveler-only metric), per-dimension precision/recall
on the failure-heavy set (P 0.8–1.0), 118 unit/route tests, contract round-trip
validation against the shared schemas.

## 6. Good-to-haves, ranked (value ÷ cost, informed by research)

1. **Voice in** — trainee speaks; realtime plumbing + transport decision; high cost,
   completes conversational realism.
2. **Competency profile (U9)** — aggregate of stored reports; low cost, retention
   value, weak demo value.
3. **Adaptive training (U10)** — scenario selection targeting weak dimensions;
   depends on U9; small once U9 exists.

## 7. Open questions — resolution status

1. ~~Product name~~ → **Lumi** (repo renamed).
2. Voice-in transport → moot for v1 (voice descoped); decide when voice returns.
3. Submission scenarios' settings → v1 ships a single generic checkpoint setting;
   per-setting referral protocols (secondary inspection vs. gate) remain future
   content work.
4. ~~Transcript `mode` semantics~~ → v1 is text-only; `mode` stays `'text'`, the
   `voice` value is reserved for when voice-out lands.
