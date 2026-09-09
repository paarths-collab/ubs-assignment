import { z } from "zod";
import { FilterInputSchema } from "./filters.schema";
import { RiskDetailSelectionSchema } from "./risk-detail.schema";

export const ManagerInsightRequestSchema = z.object({
  filters: FilterInputSchema.default({}),
  selection: RiskDetailSelectionSchema,
});

/**
 * The exact structure the model must return. Kept as the single source of
 * truth: also used to derive the JSON Schema sent to Groq's structured
 * output mode, so the model-level contract and our runtime validation can
 * never drift apart.
 */
export const ManagerInsightResponseSchema = z.object({
  whatHappened: z.string().min(1),
  whyItMatters: z.string().min(1),
  whereItSits: z.string().min(1),
  managementQuestion: z.string().min(1),
  suggestedAction: z.string().min(1),
  evidence: z.object({
    eventIds: z.array(z.string()),
    patternId: z.string().nullable(),
  }),
});

export type ManagerInsightResponse = z.infer<typeof ManagerInsightResponseSchema>;

export const MANAGER_INSIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["whatHappened", "whyItMatters", "whereItSits", "managementQuestion", "suggestedAction", "evidence"],
  properties: {
    whatHappened: { type: "string" },
    whyItMatters: { type: "string" },
    whereItSits: { type: "string" },
    managementQuestion: { type: "string" },
    suggestedAction: { type: "string" },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["eventIds", "patternId"],
      properties: {
        eventIds: { type: "array", items: { type: "string" } },
        patternId: { type: ["string", "null"] },
      },
    },
  },
} as const;
