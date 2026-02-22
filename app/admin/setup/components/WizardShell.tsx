"use client";

import { ReactNode } from "react";
import WizardProgress from "./WizardProgress";

interface WizardShellProps {
  currentStep: number;
  totalSteps: number;
  raiseMode?: string;
  onStepClick: (step: number) => void;
  children: ReactNode;
  navigation: ReactNode;
}

/**
 * WizardShell — Layout wrapper for the setup wizard.
 * Contains the header, progress bar, step content area, and navigation.
 */
export default function WizardShell({
  currentStep,
  totalSteps,
  raiseMode,
  onStepClick,
  children,
  navigation,
}: WizardShellProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Organization Setup
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Step {currentStep + 1} of {totalSteps}
        </p>
      </div>

      {/* Progress Bar */}
      <WizardProgress
        currentStep={currentStep}
        raiseMode={raiseMode}
        onStepClick={onStepClick}
      />

      {/* Step Content */}
      <div className="mt-8 mb-8" aria-live="polite" aria-atomic="true">
        <h2 className="sr-only">
          Step {currentStep + 1} of {totalSteps}
        </h2>
        {children}
      </div>

      {/* Navigation */}
      {navigation}
    </div>
  );
}
