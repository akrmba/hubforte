import React from "react";
import { reportClientError } from "../lib/api";
import { getRecentActions } from "../lib/analytics";

interface State {
  hasError: boolean;
  errorRefId: string | null;  // customer-facing reference — ERR-YYYY-MMDD-XXXX format
}

interface Props {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorRefId: null };
  }

  static getDerivedStateFromError(_: Error): State {
    const now = new Date();
    const datePart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
    return { hasError: true, errorRefId: `ERR-${datePart}-${suffix}` };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    let userId: string | undefined;
    try { userId = JSON.parse(localStorage.getItem("crm_user") || "{}").id; } catch { /* ignore */ }

    reportClientError({
      message: error.message,
      stack: info.componentStack || error.stack || "",
      route: window.location.pathname,
      errorRefId: this.state.errorRefId || undefined,
      // requestId is intentionally not set here — errorRefId is the customer reference
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm p-6 text-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              An unexpected error occurred. Please refresh the page or go back to the dashboard.
            </p>
            {this.state.errorRefId && (
              <div className="mb-6 p-3 bg-gray-100 dark:bg-zinc-800 rounded-md text-sm font-mono text-gray-500 break-all text-left">
                Reference: {this.state.errorRefId}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Refresh page
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
