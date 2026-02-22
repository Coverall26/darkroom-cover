"use client";

import { CheckCircle, AlertTriangle, Shield, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DocumentIntegrityBadgeProps {
  signedAt?: string | null;
  checksum?: string | null;
  verified?: boolean;
  className?: string;
}

export function DocumentIntegrityBadge({
  signedAt,
  checksum,
  verified = true,
  className,
}: DocumentIntegrityBadgeProps) {
  if (!signedAt) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className
        )}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Awaiting signature</span>
      </span>
    );
  }

  const signedDate = new Date(signedAt);
  const formattedDate = signedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (!verified) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 cursor-help",
                className
              )}
              role="alert"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Document integrity check failed</span>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-[280px] text-xs"
          >
            <p>
              The document content has been modified since it was signed.
              The original checksum no longer matches. Contact support
              if you believe this is an error.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 cursor-help",
              className
            )}
          >
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Signed {formattedDate}
              {checksum ? " · Integrity verified" : ""}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[280px] text-xs"
        >
          <div className="space-y-1">
            <p>
              This document was signed on {formattedDate} and its integrity
              has been verified using SHA-256 checksums.
            </p>
            {checksum && (
              <p className="font-mono text-[10px] text-muted-foreground break-all">
                Hash: {checksum.slice(0, 16)}...{checksum.slice(-8)}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
