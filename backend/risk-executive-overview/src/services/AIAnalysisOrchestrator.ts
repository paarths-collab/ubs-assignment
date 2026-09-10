import { streamCompletion } from "./LlmService";

/**
 * Shared behavioural contract for every analysis call. The specialist prompt
 * for each section is appended to this — the guardrails are never restated
 * per call, so they cannot drift apart between them.
 */
export const ANALYST_SYSTEM_PROMPT = `You are a senior enterprise risk analyst.

You receive VERIFIED_FACTS calculated by the application.

Your job is to analyse relationships between those facts, identify material management implications and suggest proportionate investigation/control actions.

You MUST NOT invent or recalculate quantitative facts.

Use only supplied evidence.

Distinguish:
- Observation
- Interpretation
- Recommendation

Do not infer personal fault from owner or assignee repetition. People repetition represents workflow concentration.

Do not claim causality unless the supplied evidence establishes it.

When evidence supports multiple explanations, acknowledge uncertainty.

If the data cannot answer something important, identify it as an evidence gap.

Be specific. Avoid merely restating dashboard metrics.

Write in plain prose with short paragraphs and, where useful, compact headed lists. Do not return JSON. Do not use markdown tables.`;

export interface AnalysisSection {
  id: string;
  title: string;
  prompt: string;
  /** Synthesis across many dimensions needs more reasoning than a summary does. */
  reasoningEffort: "low" | "medium" | "high";
}

export const DEEP_ANALYSIS_SECTIONS: AnalysisSection[] = [
  {
    id: "situation",
    title: "Situation Assessment",
    reasoningEffort: "medium",
    prompt: `Question: What is happening and why does this issue deserve management attention?

Cover, in this order and only where the facts support it:
- The overall situation in two or three sentences.
- Severity: how much of the population is High, and how much of that remains unresolved.
- Unresolved workload: the open backlog and what it implies for closure.
- Financial and potential exposure, keeping realised and potential distinct. Non-Financial events structurally carry no gross/net figure — never read an absent amount as zero risk.
- Operational burden: remediation effort relative to the volume of events.

Close with a single sentence stating how material this is for management.`,
  },
  {
    id: "pattern",
    title: "Pattern & Concentration Analysis",
    reasoningEffort: "medium",
    prompt: `Question: Where is the issue concentrated, what patterns exist, and does the evidence suggest an isolated occurrence or a broader control/workflow issue?

Structure your answer under these headings:

Pattern Diagnosis — what the organisation spread, root-cause mix, timeliness and trend figures indicate when read together.

Concentration — where the events cluster across organisations, owners and assignees. Repetition of a person indicates workflow concentration, never individual fault or performance.

Systemic vs Isolated — state which the evidence is more consistent with, and say plainly how confident that reading is. You may say the evidence is consistent with a shared process or control weakness. You must not claim the evidence proves a control failed.

Evidence Gaps — what you would need in order to decide, that this dossier does not contain.`,
  },
  {
    id: "response",
    title: "Management Response",
    reasoningEffort: "medium",
    prompt: `Question: Given the verified situation, what should management investigate and do next?

Structure your answer under these headings:

Immediate — what requires attention now, and why it cannot wait.

Investigation — the specific questions that need answering and which organisations or workflows to inspect first.

Control action — the control or process improvement worth considering, proportionate to the exposure shown.

Monitor — the indicators management should watch to know whether this is improving.

Keep every recommendation traceable to a fact in the dossier. Where a recommendation rests on an assumption, say so.`,
  },
];

export const INVESTIGATION_PLAN_SECTION: AnalysisSection = {
  id: "investigation-plan",
  title: "Investigation Plan",
  reasoningEffort: "medium",
  prompt: `Produce an investigation plan for this issue, under these headings:

Investigation Objective — one sentence.

1. Questions to answer
2. Evidence to review
3. Organisations / workflows to inspect
4. Controls to test
5. Suggested investigation sequence
6. Evidence gaps / additional data needed
7. Indicators that would warrant escalation

Be concrete: name the organisations, root causes and figures from the dossier that make each step worth doing. This should read as something an investigator could act on, not generic advice.`,
};

export const ENTERPRISE_COMPARISON_SECTION: AnalysisSection = {
  id: "enterprise-comparison",
  title: "Enterprise Comparison",
  reasoningEffort: "medium",
  prompt: `The dossier contains an enterpriseComparison object ranking this issue against every other issue in the filtered population. Rank 1 means highest on that measure. The ranking has already been calculated — interpret it, do not recompute it.

Structure your answer under these headings:

Unusually high in — the measures where this issue stands out, with its rank.

Typical in — where it sits mid-pack and is therefore unremarkable.

Lower than peers in — where it is below the norm.

What distinguishes it — the combination of measures that makes this issue different from the others, rather than any single measure.

Management implication — what the comparison changes about how much attention this deserves relative to the other issues.`,
};

/**
 * Persistent, context-aware analysis of whatever the manager is currently
 * looking at — the filtered portfolio view, not one selected issue. These
 * three lenses answer the questions a manager actually opens the dashboard
 * with, and are grounded in the same PortfolioDossier regardless of which
 * one is picked.
 */
export const PORTFOLIO_ANALYSIS_SECTIONS = {
  analyse: {
    id: "portfolio-analyse",
    title: "Analyse This View",
    reasoningEffort: "medium",
    prompt: `Question: What should a senior manager understand about the current filtered risk population?

The dossier covers exactly the population currently selected — respect any organisation, date, event-type or severity filter already applied rather than treating it as the whole enterprise.

Cover: overall scale and severity mix, whether the period-over-period trend (kpiTrend, comparing the earlier half of the filtered window to the more recent half) is improving or worsening, where exposure and potential impact concentrate, and which one or two issues in topScenarios matter most right now.

Close with a single sentence a manager could repeat in a meeting.`,
  },
  unusual: {
    id: "portfolio-unusual",
    title: "What Is Unusual?",
    reasoningEffort: "medium",
    prompt: `Question: What stands out about this filtered view compared to what would be an unremarkable baseline?

Use kpiTrend to identify what has moved between the earlier and more recent half of the filtered window, and use composition/attention to identify concentration that would not be expected if risk were evenly spread. Do not simply restate the largest numbers — a large total is only unusual if it is disproportionate to the population it sits in.

If nothing in the data clears a genuine threshold of surprise, say so plainly rather than manufacturing significance.`,
  },
  investigate: {
    id: "portfolio-investigate",
    title: "What Should Management Investigate?",
    reasoningEffort: "medium",
    prompt: `Question: Given this filtered view, what should management actually look into next?

Turn the attention cards and topScenarios into specific, prioritised questions and control checks — name the issues and organisations involved rather than speaking generically. Distinguish what needs investigation now from what merely needs monitoring.`,
  },
} as const satisfies Record<string, AnalysisSection>;

export type PortfolioLens = keyof typeof PORTFOLIO_ANALYSIS_SECTIONS;

function buildUserPrompt<T>(section: AnalysisSection, dossier: T): string {
  return `${section.prompt}

VERIFIED_FACTS:
${JSON.stringify(dossier)}`;
}

/**
 * Runs one analysis section against a verified dossier. Every section
 * receives the same dossier and never the prose of a previous section, so
 * one mistaken interpretation cannot propagate down a chain. Generic over
 * the dossier shape so the same function grounds both the per-issue
 * RiskDossier and the whole-view PortfolioDossier.
 */
export function runAnalysisSection<T>(
  section: AnalysisSection,
  dossier: T,
  onDelta: (text: string) => void,
): Promise<string> {
  return streamCompletion(
    ANALYST_SYSTEM_PROMPT,
    buildUserPrompt(section, dossier),
    onDelta,
    section.reasoningEffort,
  );
}
