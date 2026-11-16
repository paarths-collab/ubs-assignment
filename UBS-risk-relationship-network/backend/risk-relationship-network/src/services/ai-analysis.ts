import { ApiError } from "../middleware/error-handler";
import { logger } from "../logger";
import { aiAnalysisSchema } from "../schemas/ai-response";
import type { AiAnalysis } from "../schemas/ai-response";
import { buildUserPrompt, SYSTEM_PROMPT } from "../prompts/investigation-prompt";
import { requestChatCompletion } from "./ai-provider";
import type { ChatMessage } from "./ai-provider";
import type { InvestigationContext } from "./investigation-context";

/** Providers sometimes wrap JSON in prose or a code fence; recover the object without trusting it. */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new ApiError(503, "AI_INVALID_JSON", "AI analysis returned a malformed response.");
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new ApiError(503, "AI_INVALID_JSON", "AI analysis returned a malformed response.");
    }
  }
}

/**
 * Drops any evidence ID the model produced that is not part of the verified
 * scope. The model is allowed to cite evidence, never to invent it.
 */
function pruneEvidence(analysis: AiAnalysis, allowedEventIds: Set<string>): AiAnalysis {
  return {
    ...analysis,
    observations: analysis.observations.map((observation) => ({
      ...observation,
      evidenceEventIds: observation.evidenceEventIds.filter((eventId) => allowedEventIds.has(eventId)),
    })),
  };
}

export interface AnalysisResult {
  analysis: AiAnalysis;
  model: string;
  latencyMs: number;
  repaired: boolean;
}

/**
 * Runs one analysis round-trip: authoritative facts in, schema-valid
 * structured output out. One repair attempt is made if the model's first
 * reply fails validation; after that the request fails cleanly rather than
 * passing unvalidated model content to the browser.
 */
export async function runInvestigationAnalysis(
  context: InvestigationContext,
  question: string | undefined,
  requestId: string,
): Promise<AnalysisResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(context, question) },
  ];

  const first = await requestChatCompletion(messages);
  const firstParsed = aiAnalysisSchema.safeParse(extractJsonObject(first.content));

  const allowedEventIds = new Set(context.evidenceEventIds);

  if (firstParsed.success) {
    return {
      analysis: pruneEvidence(firstParsed.data, allowedEventIds),
      model: first.model,
      latencyMs: first.latencyMs,
      repaired: false,
    };
  }

  logger.warn({ requestId, issues: firstParsed.error.issues.length }, "ai response failed schema validation, repairing");

  const repair = await requestChatCompletion([
    ...messages,
    { role: "assistant", content: first.content },
    {
      role: "user",
      content:
        "Your previous reply did not match the required JSON schema. Reply again with only the JSON object described in the system prompt, with every required field present and no extra commentary.",
    },
  ]);

  const repaired = aiAnalysisSchema.safeParse(extractJsonObject(repair.content));
  if (!repaired.success) {
    logger.warn({ requestId }, "ai repair attempt also failed schema validation");
    throw new ApiError(503, "AI_INVALID_RESPONSE", "AI analysis returned a response that could not be validated.");
  }

  return {
    analysis: pruneEvidence(repaired.data, allowedEventIds),
    model: repair.model,
    latencyMs: first.latencyMs + repair.latencyMs,
    repaired: true,
  };
}
