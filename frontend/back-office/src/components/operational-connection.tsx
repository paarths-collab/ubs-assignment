"use client";
import { useEffect, useState } from "react";
export function OperationalConnection() {
  const [state, setState] = useState("Checking analysis service…");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/operational/health", { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setState(`Analysis backend connected · ${Number(data.eventCount).toLocaleString()} source events · ${data.aiConfigured ? "AI available" : "AI provider not configured"}`))
      .catch(() => { if (!controller.signal.aborted) setState("Analysis backend unavailable. Start the connected workspace to retry."); });
    return () => controller.abort();
  }, []);
  return <p role="status">{state}</p>;
}
