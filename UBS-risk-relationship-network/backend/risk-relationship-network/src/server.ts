import { createApp } from "./app";
import { config, isAiConfigured } from "./config";
import { logger } from "./logger";
import { getBrainData } from "./services/brain-data";

function start(): void {
  // Fail fast at boot rather than on the first request if the canonical
  // dataset is missing or inconsistent.
  const data = getBrainData();
  logger.info(
    { events: data.eventsById.size, nodes: data.nodesById.size, edges: data.edgesById.size },
    "canonical brain data loaded",
  );

  if (!isAiConfigured()) {
    logger.warn("AI_API_KEY is not set — /api/ai/analyse will return 503 until it is configured");
  }

  createApp().listen(config.port, () => {
    logger.info({ port: config.port, model: config.ai.model }, "risk relationship network API listening");
  });
}

start();
