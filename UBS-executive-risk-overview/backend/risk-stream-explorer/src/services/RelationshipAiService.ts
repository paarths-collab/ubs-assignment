import { readFileSync } from "node:fs";
import path from "node:path";

import type { GroqService } from "./GroqService";
import { z } from "zod";

interface BrainEvent {
  event_id: string;
  event_title: string;
  event_type: string;
  severity: string;
  status: string;
  stage: string;
  owner_organisation: string;
  discovery_organisation: string;
  owner_name: string;
  current_assignee: string;
  issue_detail: string;
  root_cause: string;
  risk_theme: string;
  or_category: string;
  gross_amount_usd: number | null;
  recovery_amount_usd: number | null;
  potential_impact_amount_usd: number | null;
  net_amount_usd: number | null;
  occurrence_date: string;
}

interface BrainNode {
  id: string;
  type: string;
  label: string;
}

interface BrainData {
  events: BrainEvent[];
  nodes: BrainNode[];
}

const RELATIONSHIP_OUTPUT_SCHEMA = {
  name: "relationship_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      observations: { type: "array", items: { type: "object", additionalProperties: false, properties: { statement: { type: "string" }, evidenceEventIds: { type: "array", items: { type: "string" } } }, required: ["statement", "evidenceEventIds"] }, minItems: 1, maxItems: 6 },
      interpretations: { type: "array", items: { type: "object", additionalProperties: false, properties: { statement: { type: "string" }, confidence: { type: "string", enum: ["low", "medium", "high"] } }, required: ["statement", "confidence"] }, minItems: 1, maxItems: 6 },
      investigationQuestions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
      recommendedActions: { type: "array", items: { type: "object", additionalProperties: false, properties: { action: { type: "string" }, reason: { type: "string" } }, required: ["action", "reason"] }, minItems: 1, maxItems: 6 },
      limitations: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    },
    required: ["summary", "observations", "interpretations", "investigationQuestions", "recommendedActions", "limitations"],
  },
} as const;

const relationshipOutput = z.object({
  summary: z.string(),
  observations: z.array(z.object({ statement: z.string(), evidenceEventIds: z.array(z.string()) })).min(1).max(6),
  interpretations: z.array(z.object({ statement: z.string(), confidence: z.enum(["low", "medium", "high"]) })).min(1).max(6),
  investigationQuestions: z.array(z.string()).min(2).max(6),
  recommendedActions: z.array(z.object({ action: z.string(), reason: z.string() })).min(1).max(6),
  limitations: z.array(z.string()).min(1).max(5),
});
const filterIntentSchema = z.object({
  eventType: z.enum(["Financial", "Non-Financial"]).optional(),
  severity: z.enum(["Low", "Moderate", "High"]).optional(),
  ownerOrganisation: z.string().nullable().optional(),
  occurrenceYear: z.string().regex(/^20\d{2}$/).nullable().optional(),
  recordingDelayMin: z.number().min(0).max(365).nullable().optional(),
  issueContains: z.string().max(120).nullable().optional(),
});
const FILTER_INTENT_SCHEMA = {
  name: "risk_filter_intent", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    properties: {
      eventType: { type: "string", enum: ["Financial", "Non-Financial"] }, severity: { type: "string", enum: ["Low", "Moderate", "High"] },
      ownerOrganisation: { type: ["string", "null"] }, occurrenceYear: { type: ["string", "null"] },
      recordingDelayMin: { type: ["number", "null"] }, issueContains: { type: ["string", "null"] },
    },
    required: ["eventType", "severity", "ownerOrganisation", "occurrenceYear", "recordingDelayMin", "issueContains"],
  },
} as const;
type RelationshipAnalysis = z.infer<typeof relationshipOutput>;

export class RelationshipNodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`Relationship node "${nodeId}" was not found.`);
    this.name = "RelationshipNodeNotFoundError";
  }
}

export class RelationshipAiService {
  private readonly events: BrainEvent[];
  private readonly nodesById: Map<string, BrainNode>;
  private readonly nodeToEvents: Map<string, Set<string>>;

  constructor(private readonly llm: GroqService, dataDir: string) {
    const events = JSON.parse(readFileSync(path.join(dataDir, "events_brain.json"), "utf8")) as { events: BrainEvent[] };
    const nodes = JSON.parse(readFileSync(path.join(dataDir, "nodes_brain.json"), "utf8")) as { nodes: BrainNode[] };
    const indexes = JSON.parse(readFileSync(path.join(dataDir, "indexes_brain.json"), "utf8")) as { node_to_events: Record<string, string[]> };
    this.events = events.events;
    this.nodesById = new Map(nodes.nodes.map((node) => [node.id, node]));
    this.nodeToEvents = new Map(Object.entries(indexes.node_to_events).map(([id, ids]) => [id, new Set(ids)]));
  }

  async interpretFilterQuery(question: string): Promise<z.infer<typeof filterIntentSchema>> {
    const organisations = [...new Set(this.events.map((event) => event.owner_organisation))];
    try {
      const output = await this.llm.completeStructured<unknown>(
        "Convert the user's risk investigation request into filter intent. Use only the provided organisation values. Return null for criteria not requested. Do not answer the question.",
        { question, supportedOrganisations: organisations, supportedYears: ["2024", "2025", "2026"] },
        FILTER_INTENT_SCHEMA,
      );
      return filterIntentSchema.parse(output);
    } catch {
      const lower = question.toLowerCase();
      const organisation = organisations.find((value) => lower.includes(value.toLowerCase())) ?? null;
      const severity = (["High", "Moderate", "Low"] as const).find((value) => lower.includes(value.toLowerCase()));
      const eventType = lower.includes("non-financial") ? "Non-Financial" : lower.includes("financial") ? "Financial" : undefined;
      const year = ["2024", "2025", "2026"].find((value) => lower.includes(value));
      const delay = lower.match(/(?:recording|recorded|delay)[^0-9]{0,20}(\d{1,3})/);
      return filterIntentSchema.parse({ eventType, severity, ownerOrganisation: organisation, occurrenceYear: year ?? null, recordingDelayMin: delay ? Number(delay[1]) : null, issueContains: null });
    }
  }

  async analyse(selectedNodeId: string | null, eventIds: string[], question?: string): Promise<{
    selectedNode: BrainNode | null;
    eventCount: number;
    severityCounts: Record<string, number>;
    eventTypeCounts: { financial: number; nonFinancial: number };
    netTotal: number | null;
    netCount: number;
    potentialTotal: number | null;
    potentialCount: number;
    evidenceEventIds: string[];
    grossTotal: number | null;
    grossCount: number;
    recoveryTotal: number | null;
    recoveryCount: number;
    analysis: RelationshipAnalysis;
  }> {
    const selectedNode = selectedNodeId === null ? null : this.nodesById.get(selectedNodeId) ?? null;
    if (selectedNodeId !== null && !selectedNode) throw new RelationshipNodeNotFoundError(selectedNodeId);

    const requested = new Set(eventIds);
    const connected = selectedNodeId === null ? null : this.nodeToEvents.get(selectedNodeId) ?? new Set<string>();
    const scoped = this.events.filter((event) => requested.has(event.event_id) && (connected === null || connected.has(event.event_id)));
    const severityCounts = scoped.reduce<Record<string, number>>((counts, event) => {
      counts[event.severity] = (counts[event.severity] ?? 0) + 1;
      return counts;
    }, {});
    const eventTypeCounts = scoped.reduce<{ financial: number; nonFinancial: number }>((counts, event) => {
      if (event.event_type === "Financial") counts.financial += 1;
      else counts.nonFinancial += 1;
      return counts;
    }, { financial: 0, nonFinancial: 0 });
    const grossValues = scoped.map((event) => event.gross_amount_usd).filter((value): value is number => value !== null);
    const recoveryValues = scoped.map((event) => event.recovery_amount_usd).filter((value): value is number => value !== null);
    const netValues = scoped.map((event) => event.net_amount_usd).filter((value): value is number => value !== null);
    const potentialValues = scoped.map((event) => event.potential_impact_amount_usd).filter((value): value is number => value !== null);

    const facts = {
      selectedNode,
      eventCount: scoped.length,
      requestedEventCount: eventIds.length,
      droppedEventCount: eventIds.length - scoped.length,
      severityCounts,
      eventTypes: scoped.reduce<Record<string, number>>((counts, event) => {
        counts[event.event_type] = (counts[event.event_type] ?? 0) + 1;
        return counts;
      }, {}),
      riskThemes: topCounts(scoped.map((event) => event.risk_theme)),
      rootCauses: topCounts(scoped.map((event) => event.root_cause)),
      organisations: topCounts(scoped.map((event) => event.owner_organisation)),
      issues: topCounts(scoped.map((event) => event.issue_detail)),
      evidenceEventIds: scoped.map((event) => event.event_id),
      eventSummaries: scoped.slice(0, 30).map((event) => ({
        id: event.event_id,
        title: event.event_title,
        severity: event.severity,
        type: event.event_type,
        issue: event.issue_detail,
        rootCause: event.root_cause,
        theme: event.risk_theme,
        ownerOrganisation: event.owner_organisation,
        potentialImpact: event.potential_impact_amount_usd,
      })),
    };

    const systemPrompt = [
      "You are a risk analyst assistant for a synthetic operational-risk relationship network.",
      "Use only the verified facts supplied by the application. Never invent metrics, event IDs, causal claims, or relationships.",
      "People concentration means workflow concentration, not personal blame. Distinguish observed facts from interpretations.",
      "Answer the user's question directly when provided. If evidence is insufficient, say so and propose a bounded investigation.",
      "Every observation evidenceEventIds value must come from the supplied evidenceEventIds list.",
    ].join("\n");
    let analysis: RelationshipAnalysis;
    try {
      const modelOutput = await this.llm.completeStructured<unknown>(systemPrompt, { facts, question: question ?? "What should the analyst investigate first?" }, RELATIONSHIP_OUTPUT_SCHEMA);
      const parsed = relationshipOutput.safeParse(modelOutput);
      if (!parsed.success) throw new Error("AI returned an invalid relationship analysis shape");
      const allowed = new Set(scoped.map((event) => event.event_id));
      analysis = {
        ...parsed.data,
        observations: parsed.data.observations.map((item) => ({ ...item, evidenceEventIds: item.evidenceEventIds.filter((id) => allowed.has(id)) })),
      };
    } catch {
      const theme = facts.riskThemes[0];
      const cause = facts.rootCauses[0];
      analysis = {
        summary: `Verified relationship scope contains ${facts.eventCount} event${facts.eventCount === 1 ? "" : "s"}. ${theme ? `The most represented risk theme is ${theme.value}.` : "No dominant risk theme is established."}`,
        observations: [{ statement: cause ? `The most represented root-cause category is ${cause.value}; this describes concentration, not causation.` : "No root-cause concentration is established in the selected scope.", evidenceEventIds: facts.evidenceEventIds.slice(0, 10) }],
        interpretations: [{ statement: "The observed grouping may help prioritise workflow review, but it does not establish a causal relationship.", confidence: "low" }],
        investigationQuestions: ["Which process step or system handoff is shared by the selected events?", "Does the concentration remain after stratifying by time, severity, and organisation?"],
        recommendedActions: [{ action: "Review the common workflow and assign a control owner.", reason: "This bounded step can test whether the observed concentration reflects a repeatable control condition." }],
        limitations: ["Verified deterministic fallback used because the configured model was unavailable.", "The dataset is synthetic; correlation does not establish causation.", "The selected scope may be incomplete or small."],
      };
    }
    return {
      selectedNode,
      eventCount: scoped.length,
      severityCounts,
      eventTypeCounts,
      grossTotal: grossValues.length > 0 ? grossValues.reduce((total, value) => total + value, 0) : null,
      grossCount: grossValues.length,
      recoveryTotal: recoveryValues.length > 0 ? recoveryValues.reduce((total, value) => total + value, 0) : null,
      recoveryCount: recoveryValues.length,
      netTotal: netValues.length > 0 ? netValues.reduce((total, value) => total + value, 0) : null,
      netCount: netValues.length,
      potentialTotal: potentialValues.length > 0 ? potentialValues.reduce((total, value) => total + value, 0) : null,
      potentialCount: potentialValues.length,
      evidenceEventIds: scoped.map((event) => event.event_id),
      analysis,
    };
  }
}

function topCounts(values: string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 8);
}
