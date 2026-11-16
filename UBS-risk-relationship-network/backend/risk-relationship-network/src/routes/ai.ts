import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config, isAiConfigured } from "../config";
import { logger } from "../logger";
import { ApiError } from "../middleware/error-handler";
import { analyseRequestSchema } from "../schemas/ai-request";
import { getBrainData } from "../services/brain-data";
import { buildInvestigationContext } from "../services/investigation-context";
import { runInvestigationAnalysis } from "../services/ai-analysis";

export const aiRouter = Router();

const aiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many analysis requests. Please wait a moment and try again.",
        requestId: req.requestId,
      },
    });
  },
});

aiRouter.post("/ai/analyse", aiRateLimiter, async (req, res, next) => {
  const startedAt = Date.now();
  try {
    if (!isAiConfigured()) {
      throw new ApiError(503, "AI_NOT_CONFIGURED", "AI analysis is not configured on this server.");
    }

    const parsed = analyseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "INVALID_REQUEST", "The analysis request payload is invalid.", {
        issues: parsed.error.issues.slice(0, 10).map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Client supplies only which events it is looking at; every fact below
    // is recomputed here from the canonical dataset.
    const context = buildInvestigationContext(getBrainData(), {
      selectedNodeId: parsed.data.selectedNodeId ?? null,
      eventIds: parsed.data.eventIds,
    });

    const result = await runInvestigationAnalysis(context, parsed.data.question, req.requestId);

    logger.info(
      {
        requestId: req.requestId,
        scopeEventCount: context.scope.eventCount,
        droppedEventCount: context.scope.droppedEventCount,
        model: result.model,
        aiLatencyMs: result.latencyMs,
        repaired: result.repaired,
        totalMs: Date.now() - startedAt,
      },
      "ai analysis completed",
    );

    res.json({
      requestId: req.requestId,
      generatedAt: new Date().toISOString(),
      model: result.model,
      /** Server-computed, authoritative — rendered separately from AI prose. */
      verifiedFacts: context,
      analysis: result.analysis,
    });
  } catch (error) {
    next(error);
  }
});
