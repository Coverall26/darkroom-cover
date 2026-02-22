"use client";

import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  DRAFT: {
    label: "Draft",
    variant: "secondary",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  SENT: {
    label: "Sent",
    variant: "default",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  PARTIALLY_FUNDED: {
    label: "Partially Funded",
    variant: "default",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  FUNDED: {
    label: "Funded",
    variant: "default",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "destructive",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  OVERDUE: {
    label: "Overdue",
    variant: "destructive",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

interface CapitalCallStatusBadgeProps {
  status: string;
  className?: string;
}

export function CapitalCallStatusBadge({
  status,
  className = "",
}: CapitalCallStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    variant: "outline" as const,
    className: "",
  };

  return (
    <Badge variant={config.variant} className={`${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}

// Response-level status badge (for LP responses within a call)
const RESPONSE_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  PARTIALLY_FUNDED: {
    label: "Partial",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  FUNDED: {
    label: "Funded",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  OVERDUE: {
    label: "Overdue",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

interface ResponseStatusBadgeProps {
  status: string;
  className?: string;
}

export function ResponseStatusBadge({
  status,
  className = "",
}: ResponseStatusBadgeProps) {
  const config = RESPONSE_STATUS_CONFIG[status] || {
    label: status,
    className: "",
  };

  return (
    <Badge variant="outline" className={`${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}
