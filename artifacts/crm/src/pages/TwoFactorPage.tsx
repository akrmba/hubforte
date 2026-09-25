import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight } from "lucide-react";

export default function TwoFactorPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const tempToken = sessionStorage.getItem("hubforte_2fa_temp");

  useEffect(() => {
    if (!tempToken) setLocation("/login");
    inputRefs.current[0]?.focus();
    // Clear on unmount
    return () => { sessionStorage.removeItem("hubforte_2fa_temp"); };
  }, []);

  const handleDigit = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[idx] = val;
    setCode(next);
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
    if (next.every(d => d) && val) {
      submitCode(next.join(""));
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const submitCode = async (finalCode: string) => {
    if (!tempToken) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/2fa/complete", { tempToken, code: finalCode });
      sessionStorage.removeItem("hubforte_2fa_temp");
      setLocation("/ext/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const submitBackup = async () => {
    if (!backupCode.trim() || !tempToken) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/2fa/complete", { tempToken, code: backupCode.trim() });
      sessionStorage.removeItem("hubforte_2fa_temp");
      setLocation("/ext/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid backup code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-cyan-500 flex items-center justify-center font-bold text-white">Y</div>
          <span className="text-lg font-semibold">Hubforte</span>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Two-Factor Authentication</h2>

        {!useBackup ? (
          <>
            <p className="text-slate-500 mt-1 mb-8">Enter the 6-digit code from your authenticator app</p>

            {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">{error}</div>}

            <div className="flex gap-2 justify-center mb-6">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  disabled={loading}
                  className="w-11 h-14 text-center text-xl font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                />
              ))}
            </div>

            <Button
              className="w-full h-11 bg-cyan-600 hover:bg-cyan-700 text-white"
              disabled={loading || code.some(d => !d)}
              onClick={() => submitCode(code.join(""))}
            >
              {loading
                ? <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Verifying...</span>
                : <span className="flex items-center gap-2">Verify <ArrowRight className="w-4 h-4" /></span>}
            </Button>

            <button
              className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 underline"
              onClick={() => { setUseBackup(true); setError(""); }}
            >
              Use a backup code instead
            </button>
          </>
        ) : (
          <>
            <p className="text-slate-500 mt-1 mb-8">Enter one of your backup codes</p>

            {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">{error}</div>}

            <Input
              placeholder="XXXXXXXXXX"
              value={backupCode}
              onChange={e => setBackupCode(e.target.value.toUpperCase())}
              className="mb-4 text-center font-mono tracking-widest"
              disabled={loading}
            />

            <Button
              className="w-full h-11 bg-cyan-600 hover:bg-cyan-700 text-white"
              disabled={loading || !backupCode.trim()}
              onClick={submitBackup}
            >
              {loading ? "Verifying..." : "Verify backup code"}
            </Button>

            <button
              className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 underline"
              onClick={() => { setUseBackup(false); setError(""); }}
            >
              Use authenticator app instead
            </button>
          </>
        )}

        <div className="mt-6 text-center">
          <button
            className="text-sm text-slate-400 hover:text-slate-600"
            onClick={() => { sessionStorage.removeItem("hubforte_2fa_temp"); setLocation("/login"); }}
          >
            ← Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
