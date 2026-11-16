import { z } from "zod";

/**
 * The contract the model must satisfy. Anything that fails this schema is
 * repaired once and then rejected — malformed provider content never
 * reaches the browser.
 */
export const aiAnalysisSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    observations: z
      .array(
        z.object({
          statement: z.string().min(1).max(1000),
          evidenceEventIds: z.array(z.string()).max(50).default([]),
        }),
      )
      .max(12)
      .default([]),
    interpretations: z
      .array(
        z.object({
          statement: z.string().min(1).max(1000),
          confidence: z.enum(["low", "medium", "high"]),
        }),
      )
      .max(12)
      .default([]),
    investigationQuestions: z.array(z.string().min(1).max(500)).max(12).default([]),
    recommendedActions: z
      .array(
        z.object({
          action: z.string().min(1).max(500),
          reason: z.string().min(1).max(1000),
        }),
      )
      .max(12)
      .default([]),
    limitations: z.array(z.string().min(1).max(500)).max(12).default([]),
  })
  .strip();

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
