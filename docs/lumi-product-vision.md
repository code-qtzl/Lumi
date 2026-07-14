# Lumi — Product Vision

## Vision

Every frontline officer and aviation worker who might one day stand in front of a
trafficking victim knows how to handle that conversation: recognize the real
behavioral indicators, ask open questions without leading or re-traumatizing, and
decide without bias — because they practiced it, including on the innocent family
that just looks nervous.

## The problem

Frontline personnel — border and immigration officers, airline and airport staff — are
positioned to encounter victims in transit, and U.S. law now mandates trafficking
training for much of the aviation workforce ([FAA Acts of 2016/2018, per DHS](https://www.dhs.gov/blue-campaign/blue-lightning-initiative)).
But victims rarely self-identify: trauma bonding, fear, and shame mean a real victim
often denies everything, while an innocent traveler may look evasive for ordinary
reasons ([U.S. State Dept., trauma-informed victim identification](https://www.state.gov/wp-content/uploads/2019/02/283795.pdf)).
Whether that moment goes well depends on technique — open, non-leading questions,
trauma-informed language, refer-don't-accuse. Yet training at scale is passive: the
DHS/DOT Blue Lightning Initiative has trained [100,000+ aviation personnel via a
17-minute video module](https://www.dhs.gov/blue-campaign/blue-lightning-initiative).
Nobody practices the conversation; nobody gets feedback. Simulation research shows
practice with feedback is what changes questioning behavior ([mega-analysis, 2,208
simulated interviews](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1133621/full))
— and that it [transfers to real field interviews](https://pmc.ncbi.nlm.nih.gov/articles/PMC9298842/).
The international framework asks exactly for this: victim identification "by qualified
and **trained** individuals" ([UN Special Rapporteur, non-punishment principle](https://reliefweb.int/report/world/implementation-non-punishment-principle-report-special-rapporteur-trafficking-persons)).

## Who it's for

Two co-primary users sharing one skill core:

- **Border/immigration officers** — structured, multi-turn interviews (esp. secondary
  inspection); the highest-stakes first contact.
- **Aviation staff** — shorter, incidental encounters (check-in, gate, in-flight);
  notice-and-refer rather than formal questioning.

Scenarios declare their setting and referral protocol; the scored skills (open
questions, trauma-informed language, indicator recognition, false-positive discipline,
correct referral) are shared.

## What it is

A training simulator. An AI agent role-plays a traveler running a hidden scenario —
trafficking or entirely innocent. The trainee conducts the conversation (text now,
voice progressively), commits to refer / no-action, then gets a debrief: rubric scores
anchored to specific transcript moments, better questions they could have asked, and
the scenario reveal. Scenarios are **archetypes with fixed ground truth and generated
surface variation** — replayable for trainees, a built-in test set for evaluating the
feedback engine.

## What it never does

- Never scores, flags, or describes a real traveler — the concern human-rights bodies
  raise about [AI in law enforcement and border management](https://www.ohchr.org/en/press-releases/2026/04/un-experts-safeguard-human-freedoms-systematic-digital-interference).
  The only person evaluated is the trainee; the only thing evaluated is technique.
- No demographic or protected-attribute features anywhere — scenarios, prompts, rubric.
- Feedback claims must be anchored to transcript/audio moments — no unanchored judgment.
- Innocent scenarios are first-class: the tool trains false-positive discipline, not
  suspicion.
- Trainee scores are private to the trainee. Organizational visibility, if ever, is
  aggregate and anonymous — a growth tool, not worker surveillance.
- Scenario content derived from real cases only with consent-first sourcing and
  de-identification; non-punishment and Do-No-Harm principles are embedded as learning
  objectives.

## How we measure it

- **North star (now): feedback faithfulness** — share of feedback claims correctly
  anchored and agreeing with expert judgment. If trainees can't trust the feedback,
  nothing else matters.
- **North star (long term): learning effect** — technique improvement across sessions
  (open-question ratio up, false-positive escalations down), the outcome the
  [simulation-training literature](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1198235/full) predicts.
- Guardrail: innocent-scenario performance tracked as prominently as detection — a tool
  that only rewards "catching traffickers" trains profiling.

## Why this can win adoption

The training pipes already exist and are legally fed: FAA-mandated aviation training,
BLI partner programs, border-force academies. They deliver passive content to a captive
audience. Lumi slots in as the practice layer — no new infrastructure, no operational
integration, no AI touching travelers.
