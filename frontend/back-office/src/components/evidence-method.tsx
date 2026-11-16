import type { ReactNode } from "react";
import styles from "./evidence-method.module.css";

const label = (value: string) => value.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());

function MethodValue({ value, depth = 0 }: { value: unknown; depth?: number }): ReactNode {
  if (value === null || value === undefined || value === "") return <span className={styles.muted}>Not specified</span>;
  if (typeof value === "string") return <span>{value}</span>;
  if (typeof value === "number") return <span>{value.toLocaleString()}</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}><MethodValue value={item} depth={depth + 1} /></li>)}</ul> : <span className={styles.muted}>None</span>;
  if (typeof value === "object" && depth < 5) return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{label(key)}</dt><dd><MethodValue value={item} depth={depth + 1} /></dd></div>)}</dl>;
  return <code>{JSON.stringify(value)}</code>;
}

export function EvidenceMethod({ method }: { method: Record<string, unknown> }) {
  return <div className={styles.method}><MethodValue value={method} /></div>;
}
