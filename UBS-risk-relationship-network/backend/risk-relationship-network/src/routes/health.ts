import { Router } from "express";
import { isAiConfigured } from "../config";
import { getBrainData } from "../services/brain-data";

export const healthRouter = Router();

/** Reports readiness without ever disclosing credentials or configuration values. */
healthRouter.get("/health", (_req, res) => {
  let brainDataLoaded = false;
  let eventCount = 0;

  try {
    const data = getBrainData();
    brainDataLoaded = data.eventsById.size > 0;
    eventCount = data.eventsById.size;
  } catch {
    brainDataLoaded = false;
  }

  res.status(brainDataLoaded ? 200 : 503).json({
    status: brainDataLoaded ? "ok" : "degraded",
    brainDataLoaded,
    eventCount,
    aiConfigured: isAiConfigured(),
  });
});
