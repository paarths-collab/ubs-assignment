import { z } from "zod";

export const EventTypeFilterSchema = z.enum(["All", "Financial", "Non-Financial"]);
export const SeverityFilterSchema = z.enum(["All", "Low", "Moderate", "High"]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

export const FilterInputSchema = z.object({
  organisation: z.string().min(1).default("Enterprise-wide"),
  dateFrom: isoDate.nullable().optional(),
  dateTo: isoDate.nullable().optional(),
  eventType: EventTypeFilterSchema.default("All"),
  severity: SeverityFilterSchema.default("All"),
});

export type EventTypeFilter = z.infer<typeof EventTypeFilterSchema>;
export type SeverityFilter = z.infer<typeof SeverityFilterSchema>;
export type FilterInput = z.infer<typeof FilterInputSchema>;

export interface NormalizedFilters {
  organisation: string;
  dateFrom: string;
  dateTo: string;
  eventType: EventTypeFilter;
  severity: SeverityFilter;
}

export const OverviewRequestSchema = z.object({
  filters: FilterInputSchema.default({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }),
});

export const PrioritySignalsRequestSchema = z.object({
  filters: FilterInputSchema.default({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }),
  limit: z.number().int().positive().max(50).default(15),
});
