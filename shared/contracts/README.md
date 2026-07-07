# Shared contracts — DRAFT for team discussion

These are the seams between the three lanes (engine / feedback+eval / UI). Everything
here is a proposal to argue with at the split conversation, not a decision.

| File | What | Produced by | Consumed by |
|---|---|---|---|
| `scenario-card.schema.json` | A scenario: persona, role-play instructions, hidden ground truth, reveal | scenario content | engine, feedback, UI |
| `transcript.schema.json` | One practice session: turns with stable IDs, trainee decision | engine | feedback, UI, eval |
| `feedback-report.schema.json` | Rubric scores with transcript anchors + modeled alternatives | feedback | UI, eval, competency profile |
| `rubric.json` | Dimension IDs, names, score scale (v0.1) | team | feedback, UI, eval |
| `indicator-catalog.json` | Behavioral indicator IDs shared by scenarios and feedback | team | content, feedback |

Rules of the road (proposed):

- Changing a schema or an ID = ping the whole team before merge.
- IDs are stable; display names/descriptions can iterate freely.
- `examples/` contains one valid instance of each schema — kept in sync (CI-checkable
  later with `jsonschema`/`ajv`).

Open questions for the split conversation:

1. Voice transport: browser connects directly to the voice API (server mints token,
   transcript posted back) vs. audio proxied through our server. Decides where
   transcripts are assembled.
2. Score scale 1–5 OK? Per-dimension weighting or flat?
3. Indicator catalog entries are placeholders sourced from public training material —
   content owner should vet/extend.
