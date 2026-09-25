import { useState } from "react";
import { useLocation } from "wouter";

/**
 * Token exchange entry page — /enter
 * Reads the invite token from the URL fragment (#token=...) and exchanges it
 * for a session cookie via POST /api/lms/public/exchange.
 * On success, redirects to /survey (or /teacher, /report based on scope).
 */
export function EnterPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"exchanging" | "error" | "idle">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Read token from fragment on mount
  useState(() => {
    const hash = window.location.hash;
    const match = hash.match(/token=([a-f0-9]+)/i);
    if (!match) {
      setStatus("error");
      setErrorMsg("No token found in the link. Please check the URL or ask your coach for a new link.");
      return;
    }

    const token = match[1];
    setStatus("exchanging");

    fetch("/api/lms/public/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Exchange failed" }));
          throw new Error(body.error || "Exchange failed");
        }
        return res.json();
      })
      .then((data) => {
        // Clear the hash so the token is no longer in the URL
        window.history.replaceState(null, "", "/enter");

        // Redirect based on scope
        const redirect = data.redirect || "/survey";
        navigate(redirect);
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err.message || "Something went wrong. Please try again.");
      });
  });

  if (status === "exchanging" || status === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="text-center p-8">
          <div className="w-10 h-10 border-4 border-[var(--color-warm-gold)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Setting up your session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
      <div className="text-center p-8 max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-xl font-bold mb-2">Link Problem</h1>
        <p className="text-gray-600 mb-4">{errorMsg}</p>
        <p className="text-sm text-gray-400">
          If this keeps happening, ask your Programme Manager for a new link.
        </p>
      </div>
    </div>
  );
}
