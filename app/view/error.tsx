"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function ViewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VIEW] Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Unable to Load Document</h2>
        <p className="text-sm text-muted-foreground mb-6">
          We had trouble loading this page. The document may have been moved or you may not have access.
        </p>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  );
}
