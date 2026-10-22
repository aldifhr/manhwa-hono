"use client";
import { Suspense, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeSlash, WarningCircle, ArrowRight } from "@phosphor-icons/react";

function sanitizeRedirect(raw: string | null): string {
  if (!raw) return "/";
  if (/[\x00-\x1f\\]/.test(raw)) return "/";
  if (/^(https?:)?\/\//i.test(raw)) return "/";
  if (/^(javascript|data|vbscript):/i.test(raw)) return "/";
  if (!raw.startsWith("/")) return "/";
  return raw;
}

function LoginInner() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const msg = (data as { error?: string })?.error || "Rate limit 5/min — tunggu 60 detik sebelum coba lagi.";
          setError(msg);
          return;
        }
        const err = data.error;
        setError((err && typeof err === "object" ? err.message : err) || "Login failed");
        return;
      }
      window.location.href = sanitizeRedirect(searchParams.get("redirect"));
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-bg flex items-center justify-center px-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(129,140,248,0.06) 0%, transparent 70%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden style={{ backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="relative z-10 w-full max-w-95 animate-fade-in-up">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-text">Manhwa<span className="text-accent">Scanner</span></h1>
          <p className="text-text-muted text-sm mt-1.5 tracking-wide uppercase">dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-6 space-y-5 shadow-lg shadow-black/20">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm bg-danger-dim border border-danger/20 text-danger" role="alert">
              <WarningCircle weight="fill" size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div>
            <label htmlFor="password" className="block text-[13px] font-medium text-text-secondary mb-2">Password</label>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" autoFocus required className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 pr-10 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-text" tabIndex={-1} aria-label={showPassword ? "Hide" : "Show"}>
                {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading || !password} className="w-full bg-accent hover:bg-accent-hover text-black text-sm font-medium rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 disabled:opacity-40">
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Sign in <ArrowRight weight="bold" size={14} /></>}
          </button>
        </form>
        <p className="text-center text-text-muted text-xs mt-4 tracking-wide">secured access only</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>}>
      <LoginInner />
    </Suspense>
  );
}
