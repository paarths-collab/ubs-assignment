import { z } from "zod";
import { config } from "../config";

/** Matches the dataset's `SIM-0000001` identifier format exactly. */
const eventIdSchema = z.string().regex(/^SIM-\d{7}$/, "Event IDs must look like SIM-0000001");

/** Node IDs are `<type>::<suffix>`; the suffix charset is deliberately narrow. */
const nodeIdSchema = z
  .string()
  .regex(
    /^(enterprise|organisation|event|person|issue|root_cause|risk_theme|or_category)::[A-Za-z0-9_-]{1,64}$/,
    "Unrecognised node ID format",
  );

export const analyseRequestSchema = z
  .object({
    selectedNodeId: nodeIdSchema.nullish(),
    eventIds: z
      .array(eventIdSchema)
      .min(1, "At least one event ID is required")
      .max(config.limits.maxEventIds, `At most ${config.limits.maxEventIds} event IDs may be submitted`),
    question: z.string().trim().max(config.limits.maxQuestionLength).optional(),
  })
  .strict();

export type AnalyseRequest = z.infer<typeof analyseRequestSchema>;
