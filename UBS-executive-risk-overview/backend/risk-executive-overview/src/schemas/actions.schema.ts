import { z } from "zod";

export const ActionTypeSchema = z.enum(["OPEN_INVESTIGATION", "ASSIGN_REVIEW", "ESCALATE"]);

export const ActionRequestSchema = z.object({
  actionType: ActionTypeSchema,
  patternId: z.string().nullable().optional(),
  eventIds: z.array(z.string().min(1)).default([]),
  note: z.string().max(2000).optional(),
});

export type ActionRequest = z.infer<typeof ActionRequestSchema>;
