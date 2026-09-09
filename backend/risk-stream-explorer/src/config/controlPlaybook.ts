/**
 * Root-cause-linked control guidance. Every entry is generic best-practice
 * phrasing for that root-cause category — never a claim about a specific
 * event — and is only surfaced when that root cause is actually present in
 * the verified data being explained, so it stays evidence-linked rather than
 * invented. Keyed by the exact 7 root-cause values present in the dataset.
 */
export const CONTROL_PLAYBOOK: Record<string, { consideration: string; investigate: string }> = {
  "Technology / System Defect": {
    consideration:
      "Strengthen automated testing and release validation for the systems involved, and add monitoring for the specific failure mode observed.",
    investigate: "Confirm whether the same system defect affects related workflows or downstream integrations.",
  },
  "Third-Party Dependency": {
    consideration:
      "Review the vendor's SLA and incident history, and confirm contractual remediation and monitoring obligations are being met.",
    investigate: "Check whether other events in the same period trace back to the same third party.",
  },
  "Process / Control Design Gap": {
    consideration:
      "Redesign the control so it detects or prevents the issue at the earliest possible point in the workflow.",
    investigate: "Assess whether the same control gap affects other processes owned by the same team.",
  },
  "Data Quality / Mapping Error": {
    consideration:
      "Add validation or reconciliation checks at the point of data entry or mapping to catch the error before it propagates.",
    investigate: "Trace the data lineage to confirm where the mapping error originated and how far it reached.",
  },
  "Process / Control Execution Failure": {
    consideration:
      "Reinforce control execution with additional review steps, checklists, or automation to reduce reliance on manual follow-through.",
    investigate: "Determine whether the control failed due to workload, training, or a one-off lapse.",
  },
  "People / Execution Error": {
    consideration:
      "Review training and procedural guidance for the task, and evaluate whether workload or process complexity contributed.",
    investigate: "Confirm whether the error is isolated or recurring across the same team or role.",
  },
  "Governance / Ownership Gap": {
    consideration:
      "Clarify ownership and escalation paths for the process involved, and confirm accountability is assigned and understood.",
    investigate: "Identify who currently owns this process end-to-end and whether that ownership is documented.",
  },
};

export function getControlGuidance(rootCause: string): { consideration: string; investigate: string } | null {
  return CONTROL_PLAYBOOK[rootCause] ?? null;
}
