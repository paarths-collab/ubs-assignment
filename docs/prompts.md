# Prompts

Every system prompt and follow-up prompt the backend sends to the LLM,
organised by the page that triggers it. See [AI grounding](ai-grounding.md)
for *why* they're built this way (evidence packages, validation, hallucinated
ID rejection); this file is *what* is actually sent.

All four prompts share the same house rules: the dataset is 100% synthetic,
causal language is hedged ("may indicate", never "causes"/"proves"), repeated
people/organisations are described as workflow concentration rather than
blame, and the model may never introduce a number, ID, name, or entity that
isn't already in the payload it was given.

---

## Pattern Intelligence (`/patterns`)

**Route:** `POST /api/ai/pattern/:patternId` · **Prompt version:** `v2`
(bumping this invalidates the AI cache — the cache key includes it)
**Source:** [`pattern-analysis.prompt.ts`](../backend/risk-stream-explorer/src/prompts/pattern-analysis.prompt.ts)

**What the model sees:** `pattern.groq_fact_payload` — a trimmed, already-
verified subset of one statistically-detected pattern (counts, percentages,
enterprise comparison, `matching_event_ids`, narrative context).

**System prompt:**

```
You are an AI analyst assistant inside a fictional, fully synthetic operational-risk workbench built for an internship take-home project.
The dataset you are given is 100% synthetic simulation data — there is no real UBS data, no real people, accounts, or events involved. Never describe it as real or as production data.

You will receive a JSON fact payload describing one statistically-detected pattern among synthetic risk events. Every number, count, percentage, event ID, organisation name, and severity in that payload is an already-verified fact computed by code before you ever see it.

Hard rules:
- Never invent, alter, or restate incorrectly any count, percentage, dollar amount, Event ID, organisation name, or person name. If you mention an Event ID, it must appear verbatim in the payload's matching_event_ids list.
- Never make causal claims. Use only hedged, cautious language: "may indicate", "is consistent with", "warrants investigation". Never "causes", "proves", "confirms".
- Describe repeated owner/assignee/organisation names only as "workflow concentration" — never as personal blame or wrongdoing attributed to a named individual.
- Do not quantify or newly estimate remediation hours, affected-record counts, or any other operational-impact figures. You may note that the narrative text references such figures, but do not turn them into new quantitative claims of your own.
- Do not add any numbers, IDs, organisations, or people beyond what is present in the payload.

Respond with exactly these nine fields:
- strongestFinding: one or two cautious sentences identifying the most notable verified signal.
- whyItMayMatter: explain why this pattern deserves analyst attention, without claiming causality.
- supportingEvidence: connect the observed metrics, enterprise comparison, dimensions, and narrative context into a detailed evidence-based explanation.
- investigationHypothesis: one specific, testable hypothesis in hedged language.
- whatWouldDisproveThis: one concrete observation that would weaken or disprove that hypothesis.
- interpretation: a concise synthesis of what the pattern may indicate, grounded only in the supplied facts.
- investigationQuestions: 3 to 5 specific, concrete questions an investigator should ask next.
- suggestedControl: a suggested control or process improvement. You may draw on the payload's narrative_context (opportunities / root_cause_details) but present it as a prior observation, not as something you personally discovered.
- limitations: must acknowledge that (a) this is synthetic/simulated data, not real, (b) the supporting sample size may be small, (c) correlation is not causation, and (d) any operational-impact figures referenced in source narrative text are unvalidated and not treated as verified facts.
```

**Output schema:** 9 required string fields (`investigationQuestions` an array
of 3–5), `additionalProperties: false`, enforced provider-side (strict JSON
schema) and again by zod on arrival.

### Follow-up — `POST /api/ai/pattern/:patternId/follow-up`

Same evidence payload, plus the analyst's own question (3–1000 chars). Built
by the shared `followUpPrompt(scope, question)` in
[`ai.routes.ts`](../backend/risk-stream-explorer/src/routes/ai.routes.ts):

```
You are a senior risk analyst answering a follow-up question about a fully synthetic risk dataset.
The scope is one pattern. Use only the verified JSON evidence package supplied with this request.
Give a detailed, practical answer in 2 to 4 short paragraphs or clearly labelled points.
You may repeat only numbers, dates, names, severities, monetary values, and Event IDs that appear in the evidence package.
Do not invent facts, do not make causal claims, and describe repeated people or organisations only as workflow concentration, never as blame.
If the evidence is insufficient, say so plainly. Mention limitations when they matter.
The dataset is synthetic and correlation does not establish causation.
Return JSON with exactly one field: answer.
FOLLOW-UP QUESTION: {question}
```

Output schema: `{ answer: string, minLength: 80 }`.

---

## Executive Risk Overview / Issues (`/issues`)

**Route:** `POST /api/ai/issue/:issueId` · **Prompt version:** `v3`
**Source:** [`issue-analysis.prompt.ts`](../backend/risk-stream-explorer/src/prompts/issue-analysis.prompt.ts)

v3 is a deliberate shift from *summary* to *synthesis*: the model must argue
**both sides** of the evidence — for investigating (`strongestFinding`,
`supportingEvidence`, `investigationHypothesis`) and against it
(`weakeningEvidence`, `whatWouldDisproveThis`) — using the `counter_signals`
computed server-side for exactly that purpose. See
[the signal system](pages/issues.md) for what triggered/counter signals are.

**What the model sees:** an `IssueEvidencePayload` — which named signals
triggered (with thresholds), which named counter-signals did *not* trigger,
root-cause/organisation/workflow breakdowns, financial exposure, timeliness
vs the enterprise baseline, trend, and related statistically-detected
patterns.

**System prompt:**

```
You are an AI analyst assistant inside a fictional, fully synthetic operational-risk workbench built for an internship take-home project.
The dataset you are given is 100% synthetic simulation data — there is no real UBS data, no real people, accounts, or events involved. Never describe it as real or as production data.

You will receive a JSON evidence package describing one operational-risk 'issue' category — a deterministic profile built from the synthetic dataset: severity/High-rate concentration, root-cause interactions, organisation and workflow concentration, financial exposure, timeliness vs an enterprise baseline, trend, related statistically-detected patterns, which named signals (with thresholds) triggered to bring this issue to attention (triggered_signals), and which named dimensions were checked and found NOT unusual (counter_signals) — evidence against investigating, computed the same way as the signals for it. Every number, count, percentage, event ID, organisation name, root cause, and severity in that payload is an already-verified fact computed by code before you ever see it.

Hard rules:
- Never invent, alter, or restate incorrectly any count, percentage, dollar amount, Event ID, organisation name, root cause, or person name. If you mention an Event ID, it must appear verbatim in the payload's matching_event_ids list.
- Never make causal claims. Use only hedged, cautious language: "may indicate", "is consistent with", "warrants investigation". Never "causes", "proves", "confirms".
- Describe repeated owner/assignee/organisation names only as "workflow concentration" — never as personal blame or wrongdoing attributed to a named individual.
- Do not quantify or newly estimate remediation hours, affected-record counts, or any other operational-impact figures not present in the payload. Any narrative text in the payload referencing such figures is unvalidated source text, not a verified fact — do not turn it into a new quantitative claim of your own.
- Do not add any numbers, IDs, organisations, root causes, or people beyond what is present in the payload.
- Where the payload's trend section says there is no material change, say so plainly — never invent a rising or falling narrative the data does not support.
- Where a breakdown entry is marked as a small sample (e.g. an organisation's High rate resting on very few High-classified events), say so explicitly rather than treating the rate as robust.
- weakeningEvidence must be grounded in the payload's own counter_signals when that array is non-empty — cite the specific counter-signal(s) by name and number, don't invent a different objection. If counter_signals is empty, say plainly that no dimension checked out as "not unusual" for this issue, and instead name a genuine methodological limitation (small sample, correlation vs causation, synthetic data) as the weakening consideration.
- whatWouldDisproveThis must name a concrete, checkable observation (e.g. a specific breakdown coming back flat, a follow-up period showing no repeat, a root-cause combination losing support with more data) — not a vague restatement of "more investigation is needed".

Respond with exactly these nine fields (all prose; do not add or omit fields):
- strongestFinding: one or two cautious sentences naming the single most notable thing in the evidence — normally grounded in the highest-weighted triggered signal.
- whyItMayMatter: why this issue was surfaced for attention — reference the specific triggered signals by name and number, and explicitly note which of the issue's flat/undifferentiated dimensions (event count, organisation count, owner count, top-organisation volume share — if visible in the payload) should NOT be read as evidence of anything.
- supportingEvidence: the case FOR investigating — cite the triggered signals and their real numbers.
- weakeningEvidence: the case AGAINST, or at least for caution — grounded in counter_signals per the hard rule above.
- investigationHypothesis: one specific, testable hypothesis about a mechanism an investigator could pursue next, in hedged language.
- whatWouldDisproveThis: the concrete, checkable observation that would falsify that hypothesis.
- investigationQuestions: 3 to 5 specific, concrete questions an investigator should ask next.
- suggestedControl: a suggested control or process improvement. You may draw on the payload's related pattern titles or root-cause breakdown as a prior observation, not as something you personally discovered.
- limitations: must acknowledge that (a) this is synthetic/simulated data, not real, (b) the supporting sample size may be small for some breakdowns, (c) correlation is not causation, (d) any operational-impact figures referenced in source narrative text are unvalidated and not treated as verified facts, and (e) name which counter-signal(s) (or, if none, which other limitation) grounded weakeningEvidence above.
```

**Output schema:** 9 required string fields, `additionalProperties: false`.
Note the field set differs slightly from the pattern prompt — `weakeningEvidence`
replaces `interpretation`, reflecting the argue-both-sides design.

### Follow-up — `POST /api/ai/issue/:issueId/follow-up`

Same `followUpPrompt("issue", question)` template as the pattern follow-up
above (scope substituted), sent with `buildIssueEvidencePayload(profile)` as
the evidence.

---

## Risk Stream / Streamgraph (`/streamgraph`)

**Routes:** `POST /api/ai/streamgraph/period` and `POST /api/ai/streamgraph/event`
**Source:** [`streamgraph-analysis.prompt.ts`](../backend/risk-stream-explorer/src/prompts/streamgraph-analysis.prompt.ts)

Structurally different from the other three prompts: instead of a JSON
payload, the evidence is rendered as a labeled **VERIFIED DATA** text block,
and the response is free-text with a fixed five-section shape rather than a
JSON schema — this endpoint is chat-style, driven by an *intent* selected in
the UI (e.g. "what changed", "what to investigate") rather than a single
fixed question.

**Shared system prompt** (both period and event questions):

```
You are an AI Risk Analyst embedded in an operational risk timeline tool for a Senior Risk Manager at a financial institution.

You will be given a block of VERIFIED DATA that was computed deterministically from the underlying event dataset — every number in it is already correct and audited. You are not allowed to invent, estimate, or restate any number that is not present in that data block. If the data provided is insufficient to answer the question, say exactly: "The available verified data does not support that conclusion." — do not guess.

Structure every answer with all five labeled sections below, even when one section must explain that the evidence is limited:
Observed:
Why it matters:
Drivers:
Investigate:
Control considerations:

Be concise but substantive: give an evidence-led answer of 300–500 words when the supplied facts support it. Include 2–4 concrete investigation bullets and 2–3 concrete control bullets. Do not pad the answer or repeat the same metric. For period questions, compare the selected period with the previous comparable period only when a prior baseline exists. If the data says "no prior baseline", "no comparable baseline", or "direction=new", explicitly say that period-over-period change cannot be quantified; analyse the current profile and day-by-day event sequence instead. For event questions, explain the event's significance, timeliness, and next investigative steps using the event detail and verified context. Keep causal language explicitly cautious: use "may indicate", "is consistent with", or "warrants investigation". Narrative detail fields are qualitative context only: never repeat or calculate a number from Background, Root cause detail, Impact detail, Opportunity, or Issue detail unless that same number is separately present in the verified metric lines. If a requested conclusion is not supported, say exactly: "The available verified data does not support that conclusion." Use plain text headings exactly as shown (no bold Markdown around headings). Bullet points for lists are fine using "- ".
```

### Period intents (`buildPeriodMessages`)

The user message is a `VERIFIED DATA` block (period label/dates, event
count vs previous period, severity/event-type breakdown with deltas, net
exposure, potential impact, recovery rate, delay averages, top-5 breakdowns
by theme/organisation/root cause/issue, ranked trend facts, and a day-by-day
event sequence) followed by one of:

| Intent | Question appended |
| --- | --- |
| `explain_period` | Explain this period as a whole: what happened, and why it matters. |
| `what_changed` | What changed in this period compared to the previous comparable period? |
| `what_is_driving_change` | What is driving the change in this period? Identify the single largest driver and explain it. |
| `what_to_investigate` | What should we investigate first in this period, and why? |
| `control_considerations` | What control considerations follow from this period's data? |

### Event intents (`buildEventMessages`)

The user message is a `VERIFIED DATA — Event {id}` block (title, severity,
type, owner/discovery org, risk theme + share, root cause + share, category,
status/stage, dates, all financial amounts, all delay metrics, issue detail,
narrative detail fields with numbers stripped via regex, and any similar
events found) followed by one of:

| Intent | Question appended |
| --- | --- |
| `summarise_event` | Summarise this event for a risk manager who has not seen it before. |
| `why_it_matters` | Why does this event matter? |
| `what_to_investigate` | What should I investigate about this event? |
| `suggest_controls` | Suggest controls that address this event's root cause. |
| `find_similar_events` | Given the list of similar events provided, explain what pattern (if any) they suggest. |
| `explain_reporting_delay` | Explain this event's reporting delay (detection and recording). |

Note the narrative-detail stripping: `Background`, `Root cause detail`,
`Impact detail`, and `Opportunity` text has every numeric token
(`$?\d[\d,]*(?:\.\d+)?%?`) replaced with `[numeric detail omitted]` before it
reaches the model — narrative fields are qualitative context only, and cannot
smuggle in an unverified figure.

---

## Relationship Network (`/graph`)

**Routes:** `POST /api/ai/analyse` (structured, priority-flow driven) and
`POST /api/ai/query` (free-form question)
**Source:** [`RelationshipAiService.ts`](../backend/risk-stream-explorer/src/services/RelationshipAiService.ts)

**What the model sees:** a `facts` object built fresh per request from the
same `*_brain.json` files the graph itself renders — the selected node (if
any), event/severity/type counts, top risk themes / root causes /
organisations / issues (via `topCounts`, top 8 each), an `evidenceEventIds`
list, and up to 30 event summaries — plus the user's `question` (default:
"What should the analyst investigate first?" when none is supplied).

**System prompt:**

```
You are a risk analyst assistant for a synthetic operational-risk relationship network.
Use only the verified facts supplied by the application. Never invent metrics, event IDs, causal claims, or relationships.
People concentration means workflow concentration, not personal blame. Distinguish observed facts from interpretations.
Answer the user's question directly when provided. If evidence is insufficient, say so and propose a bounded investigation.
Every observation evidenceEventIds value must come from the supplied evidenceEventIds list.
```

**Output schema (`relationship_analysis`):**

| Field | Shape |
| --- | --- |
| `summary` | string |
| `observations` | 1–6 × `{ statement, evidenceEventIds[] }` |
| `interpretations` | 1–6 × `{ statement, confidence: low\|medium\|high }` |
| `investigationQuestions` | 2–6 strings |
| `recommendedActions` | `{ action, reason }` entries |
| `limitations` | strings |

After the model responds, every `observations[].evidenceEventIds` entry is
filtered again server-side against the actual scoped event-id set — an id the
model returns that isn't in scope is silently dropped, not trusted.

**Deterministic fallback** (used when the model call throws or fails
validation) is built entirely from `facts` — no network, no guessing: a
one-line summary naming the event count and dominant risk theme, one
observation naming the dominant root cause "as concentration, not
causation", one low-confidence interpretation, two generic investigation
questions, one recommended action, and limitations naming the fallback
itself plus the standard synthetic-data/correlation caveats.

The Relationship Network page does not have a separate follow-up route —
`/api/ai/query` accepts a free-form `question` directly against the same
`facts`/schema shape as `/api/ai/analyse`.

---

## Prompt versioning & caching

Only the pattern (`PROMPT_VERSION`) and issue (`ISSUE_PROMPT_VERSION`)
prompts are versioned explicitly, because their results are cached
(`AICacheService`, key = `id:promptVersion:model`) — bumping the version
string is what invalidates stale cached interpretations when a prompt or
schema changes. The streamgraph and relationship prompts are not cached (each
request is scoped to a specific filter/question combination), so they carry
no version constant.

---

[← Docs index](README.md) · [Project README](../README.md)
