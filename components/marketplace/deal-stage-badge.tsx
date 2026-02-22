"use client";

import type { DealStage } from "@prisma/client";
import { DEAL_STAGE_CONFIG } from "@/lib/marketplace/types";

interface DealStageBadgeProps {
  stage: DealStage;
  size?: "sm" | "md";
}

export function DealStageBadge({ stage, size = "md" }: DealStageBadgeProps) {
  const config = DEAL_STAGE_CONFIG[stage];

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color,
        border: `1px solid ${config.color}40`,
      }}
    >
      <span
        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  );
}
