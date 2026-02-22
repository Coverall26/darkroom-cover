"use client";

import { cn } from "@/lib/utils";
import {
  Building2,
  Palette,
  TrendingUp,
  UserPlus,
  FileText,
  DollarSign,
  Users,
  Settings,
  Rocket,
  Check,
} from "lucide-react";

const WIZARD_STEPS = [
  { id: 1, label: "Company info", icon: Building2 },
  { id: 2, label: "Branding", icon: Palette },
  { id: 3, label: "Raise style", icon: TrendingUp },
  { id: 4, label: "Team", icon: UserPlus },
  { id: 5, label: "Dataroom", icon: FileText },
  { id: 6, label: "Fund details", icon: DollarSign },
  { id: 7, label: "LP onboarding", icon: Users },
  { id: 8, label: "Integrations", icon: Settings },
  { id: 9, label: "Launch", icon: Rocket },
];

interface WizardProgressProps {
  currentStep: number;
  raiseMode?: string;
  onStepClick?: (step: number) => void;
}

export default function WizardProgress({
  currentStep,
  raiseMode,
  onStepClick,
}: WizardProgressProps) {
  // Steps 5 and 6 (0-indexed) are Fund Details and LP Onboarding — skipped for DATAROOM_ONLY
  const skippedSteps =
    raiseMode === "DATAROOM_ONLY" ? [5, 6] : [];

  return (
    <nav className="w-full overflow-x-auto scrollbar-hide py-4" aria-label="Setup wizard progress">
      <ol className="flex items-center justify-between min-w-[700px] px-2" role="list">
        {WIZARD_STEPS.map((step, index) => {
          const isSkipped = skippedSteps.includes(index);
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const Icon = step.icon;

          return (
            <li key={step.id} className="flex items-center flex-1 last:flex-none" aria-current={isCurrent ? "step" : undefined}>
              <button
                onClick={() => !isSkipped && onStepClick?.(index)}
                disabled={isSkipped}
                aria-label={`Step ${step.id}: ${step.label}${isCompleted ? " (completed)" : isCurrent ? " (current)" : isSkipped ? " (skipped)" : ""}`}
                className={cn(
                  "flex flex-col items-center gap-1.5 min-w-[64px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-lg",
                  isSkipped && "opacity-40 cursor-not-allowed",
                  !isSkipped && onStepClick && "cursor-pointer",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all",
                    isCompleted && "bg-[#0066FF] border-[#0066FF] text-white",
                    isCurrent && "border-[#0066FF] text-[#0066FF] bg-blue-50",
                    !isCompleted && !isCurrent && "border-gray-300 text-gray-400",
                    isSkipped && "line-through",
                  )}
                >
                  {isCompleted ? (
                    <Check size={16} />
                  ) : (
                    <Icon size={16} />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium text-center leading-tight",
                    isCurrent && "text-[#0066FF]",
                    isCompleted && "text-gray-700",
                    !isCompleted && !isCurrent && "text-gray-400",
                    isSkipped && "line-through",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2",
                    index < currentStep ? "bg-[#0066FF]" : "bg-gray-200",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
