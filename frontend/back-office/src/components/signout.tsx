"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearPrivateState } from "@/lib/api";

export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const expire = () => { clearPrivateState(); router.replace("/login"); };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [router]);
  return <><button disabled={busy} title={error || undefined} onClick={async () => {
    setBusy(true); setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      clearPrivateState(); router.replace("/login");
    } catch { setError("Sign out failed. Try again to securely end your session."); }
    finally { setBusy(false); }
  }}>{busy ? "Signing out…" : error ? "Retry sign out" : "Sign out"}</button>{error && <span className="visually-hidden" role="alert">{error}</span>}</>;
}
