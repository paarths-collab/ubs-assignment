import type { FastifyInstance, FastifyReply } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository";
import type { RiskDossier } from "../types/Dossier";
import { ManagerInsightRequestSchema } from "../schemas/ai.schema";
import { normalizeFilters, filterEvents } from "../services/FilterService";
import { buildScenarioSignals, rankScenarioSignals } from "../services/ScenarioService";
import { buildRiskDossier } from "../services/DossierService";
import { isAiConfigured } from "../services/GroqService";
import {
  DEEP_ANALYSIS_SECTIONS,
  ENTERPRISE_COMPARISON_SECTION,
  INVESTIGATION_PLAN_SECTION,
  runAnalysisSection,
  type AnalysisSection,
} from "../services/AIAnalysisOrchestrator";
import { AppError } from "../utils/errors";

interface StreamEvent {
  type:
    | "analysis_start"
    | "section_start"
    | "section_delta"
    | "section_complete"
    | "analysis_complete"
    | "analysis_error";
  [key: string]: unknown;
}

function openStream(reply: FastifyReply): (event: StreamEvent) => void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  return (event: StreamEvent) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };
}

/**
 * Resolves the manager's selection to the same verified dossier every
 * analysis call is grounded in. Rebuilt server-side on each request — a
 * client-supplied fact package is never trusted.
 */
function resolveDossier(
  body: { filters: unknown; selection: unknown },
  repository: RiskRepository,
): RiskDossier {
  const parsed = ManagerInsightRequestSchema.parse(body);
  const config = repository.getConfig();
  const filters = normalizeFilters(parsed.filters, config);
  const filteredEvents = filterEvents(repository.getEvents(), filters);

  const scenarios = rankScenarioSignals(buildScenarioSignals(filteredEvents, repository.getPatterns(), config));

  const selection = parsed.selection;
  let selected: (typeof scenarios)[number] | undefined;
  if (selection.type === "pattern") {
    selected = scenarios.find((scenario) => scenario.patternId === selection.patternId);
  } else if (selection.type === "issue") {
    selected = scenarios.find((scenario) => scenario.issueDetail === selection.issueDetail);
  }

  if (!selected) {
    throw new AppError("NO_EVENTS_MATCH", "The selected issue has no events within the current filters");
  }

  const selectedIds = new Set(selected.eventIds);
  const scenarioEvents = filteredEvents.filter((event) => selectedIds.has(event.eventId));

  return buildRiskDossier(selected, scenarios, scenarioEvents, filters, config);
}

async function runStream(
  sections: AnalysisSection[],
  analysisType: string,
  body: { filters: unknown; selection: unknown },
  repository: RiskRepository,
  reply: FastifyReply,
  log: FastifyInstance["log"],
): Promise<void> {
  let dossier: RiskDossier;
  try {
    dossier = resolveDossier(body, repository);
  } catch (error) {
    // Selection/filter problems happen before the stream opens, so they can
    // still be reported as a normal HTTP error.
    throw error;
  }

  if (!isAiConfigured()) {
    reply.status(503).send({
      error: {
        code: "AI_UNAVAILABLE",
        message: "AI assistant is not configured. Set GROQ_API_KEY in the backend environment to enable it.",
      },
    });
    return;
  }

  const send = openStream(reply);
  const startedAt = Date.now();

  send({
    type: "analysis_start",
    analysisType,
    title: dossier.title,
    eventCount: dossier.evidence.eventCount,
    organisationCount: dossier.recurrence.organisationCount,
    filters: dossier.filters,
    sections: sections.map((section) => ({ id: section.id, title: section.title })),
  });

  try {
    for (const section of sections) {
      send({ type: "section_start", sectionId: section.id, title: section.title });

      const text = await runAnalysisSection(section, dossier, (delta) => {
        send({ type: "section_delta", sectionId: section.id, delta });
      });

      send({ type: "section_complete", sectionId: section.id, characters: text.length });
    }

    send({
      type: "analysis_complete",
      analysisType,
      durationMs: Date.now() - startedAt,
      evidence: { eventCount: dossier.evidence.eventCount, eventIds: dossier.evidence.eventIds },
    });
  } catch (error) {
    // The stream is already open, so a failure has to be reported inside it
    // rather than as an HTTP status the client will never see.
    // The provider's raw error body can carry keys, quota details and
    // internal codes — it is logged server-side but never streamed out.
    log.warn({ err: error }, "AI analysis stream failed");
    send({
      type: "analysis_error",
      message:
        error instanceof AppError && error.code === "AI_INVALID_RESPONSE"
          ? "The assistant returned an unusable response. Please retry."
          : "The analysis service is temporarily unavailable. Please retry.",
    });
  } finally {
    reply.raw.end();
  }
}

export function registerAiStreamRoutes(app: FastifyInstance, repository: RiskRepository): void {
  app.post("/api/ai/deep-analysis/stream", async (request, reply) => {
    await runStream(
      DEEP_ANALYSIS_SECTIONS,
      "deep-analysis",
      request.body as { filters: unknown; selection: unknown },
      repository,
      reply,
      app.log,
    );
  });

  app.post("/api/ai/investigation-plan/stream", async (request, reply) => {
    await runStream(
      [INVESTIGATION_PLAN_SECTION],
      "investigation-plan",
      request.body as { filters: unknown; selection: unknown },
      repository,
      reply,
      app.log,
    );
  });

  app.post("/api/ai/enterprise-comparison/stream", async (request, reply) => {
    await runStream(
      [ENTERPRISE_COMPARISON_SECTION],
      "enterprise-comparison",
      request.body as { filters: unknown; selection: unknown },
      repository,
      reply,
      app.log,
    );
  });

  /** The verified dossier on its own — useful for auditing exactly what the model was shown. */
  app.post("/api/ai/dossier", async (request) => ({
    dossier: resolveDossier(request.body as { filters: unknown; selection: unknown }, repository),
  }));
}
