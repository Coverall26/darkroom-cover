import { useState, useEffect, useCallback } from "react";

interface OnboardingFlowState {
  currentStep: number;
  stepData: Record<string, unknown>;
  stepsCompleted: Record<string, boolean>;
  isLoading: boolean;
}

/**
 * Hook to manage LP onboarding flow auto-save and resume.
 *
 * Loads saved onboarding progress from the server when fundId is available,
 * provides a `saveProgress` callback for debounced auto-save, and a
 * `markComplete` callback to finalize the flow.
 *
 * @param fundId - The fund the LP is onboarding into. Pass null/undefined
 *   until fund context is loaded; the hook will fetch when it becomes available.
 */
export function useOnboardingFlow(fundId: string | null | undefined) {
  const [state, setState] = useState<OnboardingFlowState>({
    currentStep: 1,
    stepData: {},
    stepsCompleted: {},
    isLoading: false,
  });

  // Load saved state when fundId becomes available
  useEffect(() => {
    if (!fundId) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    fetch(`/api/lp/onboarding-flow?fundId=${fundId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.flow) {
          setState({
            currentStep: data.flow.currentStep || 1,
            stepData: data.flow.formData || {},
            stepsCompleted: data.flow.stepsCompleted || {},
            isLoading: false,
          });
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      })
      .catch(() => setState((prev) => ({ ...prev, isLoading: false })));
  }, [fundId]);

  // Save progress — caller provides the full form data each time
  const saveProgress = useCallback(
    async (
      step: number,
      formData: Record<string, unknown>,
      stepsCompleted?: Record<string, boolean>,
    ) => {
      if (!fundId) return;

      try {
        await fetch("/api/lp/onboarding-flow", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fundId,
            currentStep: step,
            formData,
            stepsCompleted,
          }),
        });
        setState((prev) => ({
          ...prev,
          currentStep: step,
          stepData: formData,
          stepsCompleted: stepsCompleted || prev.stepsCompleted,
        }));
      } catch {
        // Auto-save failures are non-blocking
      }
    },
    [fundId],
  );

  // Mark onboarding as complete (sets status → COMPLETED on server)
  const markComplete = useCallback(async () => {
    if (!fundId) return;

    try {
      await fetch(`/api/lp/onboarding-flow?fundId=${fundId}`, {
        method: "DELETE",
      });
    } catch {
      // Non-blocking
    }
  }, [fundId]);

  return { ...state, saveProgress, markComplete };
}
