import { z } from "zod";
import { FilterInputSchema } from "./filters.schema.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

export const RiskDetailSelectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pattern"), patternId: z.string().min(1) }),
  z.object({ type: z.literal("kpi"), kpiId: z.string().min(1) }),
  z.object({ type: z.literal("issue"), issueDetail: z.string().min(1) }),
  z.object({ type: z.literal("period"), dateFrom: isoDate, dateTo: isoDate }),
  z.object({ type: z.literal("eventIds"), eventIds: z.array(z.string().min(1)).min(1) }),
]);

export const RiskDetailRequestSchema = z.object({
  filters: FilterInputSchema.default({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }),
  selection: RiskDetailSelectionSchema,
});

export type RiskDetailSelectionInput = z.infer<typeof RiskDetailSelectionSchema>;
