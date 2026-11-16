"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { authSwitchHref, browserReturnTo, serverReturnTo, subscribeReturnTo } from "@/lib/return-to";

export default function Register() {
  const router = useRouter();
  const destination = useSyncExternalStore(subscribeReturnTo, browserReturnTo, serverReturnTo);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      router.replace(browserReturnTo());
    } catch { setError("Could not create account. Check your details or use another email."); }
    finally { setBusy(false); }
  }
  return <main id="main" className="content auth-page"><p className="eyebrow">DIGITAL BACK OFFICE</p>
    <h1>Create your account.</h1><p>Create a private workspace for your data and analyses.</p>
    <form onSubmit={submit} className="auth-form"><label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button disabled={busy} type="submit">{busy ? "Creating…" : "Create account"}</button></form>
    <p>Already registered? <Link href={authSwitchHref("/login", destination)}>Sign in</Link></p></main>;
}
