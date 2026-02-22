"use client";

import { useEffect } from "react";
import { useRollbar } from "@rollbar/react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

/**
 * Error boundary for the entire LP portal (/lp/*).
 * Catches render errors in any LP page and provides branded error UI
 * matching the LP dark theme.
 */
export default function LPPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const rollbar = useRollbar();

  useEffect(() => {
    if (rollbar) {
      rollbar.error(error, {
        context: "lp-portal",
        digest: error.digest,
      });
    }
  }, [error, rollbar]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-semibold text-white mb-3">
          Something Went Wrong
        </h2>
        <p className="text-gray-400 mb-2 text-sm">
          We encountered an error while loading this page.
          Please try again or return to the dashboard.
        </p>
        {error.digest && (
          <p className="text-gray-500 text-xs mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Button
            onClick={reset}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white h-11"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            variant="outline"
            className="w-full border-gray-600 text-gray-300 hover:bg-gray-800 h-11"
            onClick={() => window.location.href = "/lp/dashboard"}
          >
            <Home className="h-4 w-4 mr-2" />
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
