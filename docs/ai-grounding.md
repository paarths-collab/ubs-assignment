# The AI grounding architecture

This is the part that matters most. The LLM is treated as an untrusted
interpreter of trusted facts.

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant R as Fastify route
    participant C as AICacheService
    participant S as Deterministic service
    participant G as GroqService (OpenAI-compatible)
    participant P as LLM provider
    participant V as AIValidationService

    U->>R: POST /api/ai/pattern/:id  (empty body — ID only)
    R->>C: get(patternId:promptVersion:model)
    alt cache hit (TTL 1h)
        C-->>U: cached structured result
    else miss
        R->>S: resolve pattern by ID (server-side)
        S-->>R: verified evidence package
        R->>G: system prompt + evidence + JSON schema
        G->>P: chat/completions (strict schema, per-call timeout, total request budget)
        P-->>G: JSON
        G-->>V: raw result
        V->>V: zod schema check
        V->>V: every SIM-xxxxx token ∈ matching_event_ids?
        alt valid
            V-->>R: structured result
            R->>C: set(...)
            R-->>U: {status:"ok", …}
        else invalid (attempt 1 of 2)
            R->>G: regenerate once
        else invalid (attempt 2)
            R-->>U: {status:"ok", deterministic fallback + provenance}
        end
    end
```

## Quantitative facts and model prose

Quantitative facts are rendered by deterministic panels and fallback templates.
Model prose is qualitative. All analysis consumers use `checkModelGrounding`
before publishing a completion: quantitative claims are rejected even when
the same digits occur elsewhere in the evidence. This prevents a count from
being certified as a percentage, amount, or delay. Event citations must still
belong to the server-resolved evidence; the follow-up question never enlarges
that set. The token-membership helpers `checkGrounding` / `checkNumbers` are
diagnostics for trusted templates, not sufficient validators for model prose.

Pattern and issue analysis retries a rejected completion within its total
budget and otherwise returns a deterministic fallback with provenance.
Streamgraph and relationship analysis also fall back on invalid claims;
relationship analysis rejects the whole completion rather than removing an
unsupported citation and keeping its claim. Follow-up answers that cannot be
verified are withheld.

KPI analysis buffers each section until validation passes, then publishes its
text through the existing SSE section protocol. Rejected sections emit an
`analysis_error` without any rejected prose. Provider deadlines cover headers
and complete body consumption; a whole KPI request has a shared fifty-second
budget across sections, and a browser disconnect cancels the provider request.

The guard does not prove qualitative interpretations or causal hypotheses.
Common spelled-out quantity claims are rejected, but arbitrary natural-language
paraphrases still require analyst judgment. Synthetic-data and correlation
limitations remain part of every prompt.

## The guarantees, concretely

| Guarantee | Where it is enforced |
| --- | --- |
| **The client cannot supply facts.** AI requests carry only an ID in the URL (and, for follow-ups, a 3–1000 char question). Body limit 2 KB. | `ai.routes.ts` — `isAcceptableEmptyBody`, `readFollowUpQuestion` |
| **Evidence is server-resolved** from the canonical dataset every time. | `buildObservedFacts`, `buildIssueEvidencePayload`, `RelationshipAiService` reads the same `*_brain.json` the UI renders |
| **Output shape is enforced twice** — provider-side `strict` JSON schema, then zod on arrival (structured surfaces). | `GroqService` schemas + `AIValidationService` |
| **No unsupported Event IDs.** Any `SIM-\d{4,}` token anywhere in the response must be in the pattern/issue's own allowed event ids, or the whole response is rejected. | `validateGroqResult` / `validateGroqIssueResult` / `checkModelGrounding` |
| **Bounded retries.** At most one regeneration (`MAX_VALIDATION_ATTEMPTS = 2`), then deterministic fallback. | `ai.routes.ts` |
| **No key in the browser.** The provider key lives only in the backend `.env`; it is never logged, echoed, or stored client-side. | `config/env.ts`, logger `redact` |
| **Rate limited.** 15 req/min for pattern & issue AI, 30 req/min for relationship AI, per route. | `@fastify/rate-limit` (registered **before** routes — see `app.ts`) |
| **Cache invalidates on prompt/model change.** Key is `id:promptVersion:model`. | `AICacheService` |
| **Degrades, never breaks.** No key ⇒ warning at boot, deterministic routes unaffected, AI panels show a fallback. | `assertUsable`, route fallbacks |

## Provider abstraction

OpenRouter, Groq and OpenAI all speak the same `chat/completions` protocol, so
switching is config-only — no request/response reshaping:

```mermaid
flowchart LR
    E[.env<br/>LLM_PROVIDER] --> LC[loadLlmConfig]
    LC --> OR["openrouter (default)<br/>deepseek/deepseek-v4-flash-0731"]
    LC --> GQ["groq<br/>openai/gpt-oss-120b"]
    LC --> OA["openai<br/>gpt-4o-mini"]
    OR & GQ & OA --> GS[GroqService<br/>GroqClientLike interface]
    GS --> T[Tests inject a fake client<br/>— no network]
```

Model slugs are **pinned**, never `-latest`, so behaviour can't silently drift
between authoring and review. `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`
override everything for an unlisted provider.

## The prompt contract

Three versioned prompt builders (`src/prompts/`). The pattern and issue
analysts return the same disciplined 9–10 field structure:

| Field | Purpose |
| --- | --- |
| `strongestFinding` | The single most defensible observation |
| `interpretation` | What it plausibly means |
| `supportingEvidence` | Which verified facts back it |
| `weakeningEvidence` *(issues)* | What argues against it |
| `investigationHypothesis` | A testable statement |
| `whatWouldDisproveThis` | The falsifier — forces intellectual honesty |
| `whyItMayMatter` | Business relevance, hedged |
| `investigationQuestions` | 3–5 concrete next questions |
| `suggestedControl` | A candidate mitigation |
| `limitations` | Explicit caveats |

House rules baked into every prompt: synthetic data, correlation ≠ causation,
repeated people/orgs are described as **workflow concentration, never blame**,
and "insufficient evidence" is an acceptable answer.


The full text of every prompt — system prompts and follow-up templates, one section per page — lives in [prompts.md](prompts.md).
---

[← Docs index](README.md) · [Project README](../README.md)
