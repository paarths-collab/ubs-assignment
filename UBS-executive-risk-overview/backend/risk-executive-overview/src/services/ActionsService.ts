import { randomUUID } from "node:crypto";
import type { ActionRequest } from "../schemas/actions.schema.js";

export interface RecordedAction extends ActionRequest {
  actionId: string;
  createdAt: string;
  status: "SIMULATED";
}

/**
 * Prototype-only, in-memory action log. No real UBS workflow system is
 * written to — this exists so the frontend can show "action taken"
 * confirmation and so the API shape is realistic enough to later swap in a
 * real service without changing the contract.
 */
export class ActionsService {
  private readonly actions: RecordedAction[] = [];

  record(request: ActionRequest): RecordedAction {
    const action: RecordedAction = {
      ...request,
      actionId: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "SIMULATED",
    };
    this.actions.push(action);
    return action;
  }

  list(): readonly RecordedAction[] {
    return this.actions;
  }
}
