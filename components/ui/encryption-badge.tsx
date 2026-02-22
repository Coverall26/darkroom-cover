"use client";

import { Lock, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EncryptionBadgeProps {
  variant?: "compact" | "full";
  label?: string;
  className?: string;
}

export function EncryptionBadge({
  variant = "full",
  label = "AES-256 Encrypted",
  className,
}: EncryptionBadgeProps) {
  const tooltipText =
    "This field is encrypted at rest using AES-256-GCM encryption. Only authorized systems can decrypt this data.";

  if (variant === "compact") {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center text-gray-400 dark:text-gray-500 cursor-help",
                className
              )}
              aria-label={label}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-[240px] text-xs"
          >
            <p>{tooltipText}</p>
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
              "inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-help",
              className
            )}
          >
            <Shield className="h-3 w-3" aria-hidden="true" />
            <span>{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[240px] text-xs"
        >
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
