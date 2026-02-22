"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  saving: boolean;
  onNext: () => void;
  onPrev: () => void;
}

/**
 * WizardNavigation — Next/Back/Skip buttons with validation state.
 * Extracted from page.tsx for reusability and clean separation.
 */
export default function WizardNavigation({
  currentStep,
  totalSteps,
  saving,
  onNext,
  onPrev,
}: WizardNavigationProps) {
  // Don't show navigation on the final (Launch) step — it has its own Complete button
  if (currentStep >= totalSteps - 1) return null;

  return (
    <div className="flex items-center justify-between border-t pt-6">
      <Button
        variant="outline"
        onClick={onPrev}
        disabled={currentStep === 0}
        className="min-h-[44px]"
        aria-label="Go to previous step"
      >
        <ArrowLeft size={16} className="mr-1" />
        Back
      </Button>
      <Button
        onClick={onNext}
        disabled={saving}
        className="bg-[#0066FF] hover:bg-[#0052CC] text-white min-h-[44px]"
        aria-label={currentStep === totalSteps - 2 ? "Go to review step" : "Continue to next step"}
      >
        {saving ? (
          <Loader2 size={16} className="mr-1 animate-spin" />
        ) : null}
        {currentStep === totalSteps - 2 ? "Review" : "Continue"}
        <ArrowRight size={16} className="ml-1" />
      </Button>
    </div>
  );
}
