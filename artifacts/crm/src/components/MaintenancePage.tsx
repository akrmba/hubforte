import { useEffect, useState } from "react";

interface MaintenanceInfo {
  message: string;
  estimatedResolution: string | null;
  enabledAt: string | null;
}

export function MaintenancePage({ info }: { info?: MaintenanceInfo }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const message = info?.message || "We're performing scheduled maintenance. We'll be back shortly.";
  const estimatedResolution = info?.estimatedResolution;
  const enabledAt = info?.enabledAt ? new Date(info.enabledAt) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-12 w-12 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5L12 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Scheduled Maintenance
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{message}</p>
        {estimatedResolution && (
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-2">
            Expected back by: {estimatedResolution}
          </p>
        )}
        {enabledAt && (
          <p className="text-xs text-gray-400 dark:text-gray-600">
            Maintenance started at {enabledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {now > enabledAt && (
              <span> ({Math.round((now.getTime() - enabledAt.getTime()) / 60000)} min ago)</span>
            )}
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full inline-flex justify-center items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Refresh page
        </button>
      </div>
    </div>
  );
}
