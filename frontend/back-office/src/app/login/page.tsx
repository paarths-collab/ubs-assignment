"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { authSwitchHref, browserReturnTo, serverReturnTo, subscribeReturnTo } from "@/lib/return-to";

export default function Login() {
  const router = useRouter();
  const destination = useSyncExternalStore(subscribeReturnTo, browserReturnTo, serverReturnTo);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      router.replace(browserReturnTo());
    } catch { setError("Sign in failed. Check your credentials or try again later."); }
    finally { setBusy(false); }
  }
  return <main id="main" className="content auth-page"><p className="eyebrow">DIGITAL BACK OFFICE</p>
    <h1>Welcome back.</h1><p>Sign in to your analytics workspace.</p>
    <form onSubmit={submit} className="auth-form"><label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input name="password" type="password" minLength={8} required autoComplete="current-password" /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button disabled={busy} type="submit">{busy ? "Signing in…" : "Continue to workspace →"}</button></form>
    <p>New here? <Link href={authSwitchHref("/register", destination)}>Create account</Link></p></main>;
}
