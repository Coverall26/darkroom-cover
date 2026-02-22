"use client";

import { lazy, Suspense, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import WizardShell from "./components/WizardShell";
import WizardNavigation from "./components/WizardNavigation";
import StepSkeleton from "./components/StepSkeleton";
import { useWizardState } from "./hooks/useWizardState";

// Lazy-loaded step components — each in its own code-split chunk
const Step1CompanyInfo = lazy(() => import("./components/Step1CompanyInfo"));
const Step2Branding = lazy(() => import("./components/Step2Branding"));
const Step3RaiseStyle = lazy(() => import("./components/Step3RaiseStyle"));
const Step4TeamInvites = lazy(() => import("./components/Step4TeamInvites"));
const Step5Dataroom = lazy(() => import("./components/Step5Dataroom"));
const Step6FundDetails = lazy(() => import("./components/Step6FundDetails"));
const Step7LPOnboarding = lazy(() => import("./components/Step7LPOnboarding"));
const Step8Integrations = lazy(() => import("./components/Step8Integrations"));
const Step9Launch = lazy(() => import("./components/Step9Launch"));

const TOTAL_STEPS = 9;

export default function GPSetupWizardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const wizard = useWizardState();
  const [completing, setCompleting] = useState(false);

  // Validate current step before advancing
  const validateStep = useCallback(
    (step: number): string | null => {
      const d = wizard.data;
      switch (step) {
        case 0: // Company Info
          if (!d.companyName) return "Company name is required";
          if (!d.entityType) return "Entity type is required";
          if (!d.ein || d.ein.replace(/\D/g, "").length !== 9)
            return "Valid EIN is required (XX-XXXXXXX)";
          if (!d.badActorCertified)
            return "Bad Actor Certification is required to proceed";
          if (!d.address) return "Street address is required";
          if (!d.city) return "City is required";
          if (!d.state) return "State is required";
          if (!d.contactName) return "Contact name is required";
          if (!d.contactEmail) return "Contact email is required";
          if (!d.contactPhone) return "Contact phone is required";
          return null;
        case 2: // Raise Style
          if (!d.raiseMode) return "Please select a raise type";
          if (d.raiseMode !== "DATAROOM_ONLY" && !d.regDExemption)
            return "Please select a Regulation D exemption";
          return null;
        case 4: // Dataroom
          if (!d.dataroomName && !d.companyName)
            return "Dataroom name is required";
          return null;
        case 5: // Fund Details (skip for DATAROOM_ONLY)
          if (d.raiseMode === "DATAROOM_ONLY") return null;
          if (d.raiseMode === "GP_FUND" && !d.fundName)
            return "Fund name is required";
          if (!d.targetRaise) return "Target raise is required";
          if (!d.bankName) return "Bank name is required";
          if (!d.accountNumber) return "Account number is required";
          if (!d.routingNumber) return "Routing number is required";
          return null;
        default:
          return null;
      }
    },
    [wizard.data],
  );

  const handleNext = useCallback(async () => {
    const error = validateStep(wizard.currentStep);
    if (error) {
      toast.error(error);
      return;
    }

    await wizard.saveStep(wizard.currentStep);

    // Skip Fund Details + LP Onboarding for DATAROOM_ONLY
    let nextStep = wizard.currentStep + 1;
    if (wizard.data.raiseMode === "DATAROOM_ONLY") {
      if (nextStep === 5) nextStep = 7;
    }
    wizard.goToStep(Math.min(nextStep, TOTAL_STEPS - 1));
  }, [wizard, validateStep]);

  const handlePrev = useCallback(() => {
    let prevStep = wizard.currentStep - 1;
    if (wizard.data.raiseMode === "DATAROOM_ONLY") {
      if (prevStep === 6) prevStep = 4;
      if (prevStep === 5) prevStep = 4;
    }
    wizard.goToStep(Math.max(0, prevStep));
  }, [wizard]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wizard.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to complete setup");
      }
      const result = await res.json();
      wizard.clearState();
      toast.success("Organization setup complete!");
      router.push(result.redirectUrl || "/admin/dashboard");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to complete setup",
      );
    } finally {
      setCompleting(false);
    }
  }, [wizard, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    router.push("/admin/login");
    return null;
  }

  const renderStep = () => {
    const props = { data: wizard.data, updateField: wizard.updateField };

    switch (wizard.currentStep) {
      case 0:
        return <Step1CompanyInfo {...props} />;
      case 1:
        return <Step2Branding {...props} />;
      case 2:
        return <Step3RaiseStyle {...props} />;
      case 3:
        return <Step4TeamInvites {...props} />;
      case 4:
        return <Step5Dataroom {...props} />;
      case 5:
        return <Step6FundDetails {...props} />;
      case 6:
        return <Step7LPOnboarding {...props} />;
      case 7:
        return <Step8Integrations {...props} />;
      case 8:
        return (
          <Step9Launch
            {...props}
            onGoToStep={wizard.goToStep}
            onComplete={handleComplete}
            completing={completing}
          />
        );
      default:
        return null;
    }
  };

  return (
    <WizardShell
      currentStep={wizard.currentStep}
      totalSteps={TOTAL_STEPS}
      raiseMode={wizard.data.raiseMode}
      onStepClick={(step) => {
        if (step <= wizard.currentStep) {
          wizard.goToStep(step);
        }
      }}
      navigation={
        <WizardNavigation
          currentStep={wizard.currentStep}
          totalSteps={TOTAL_STEPS}
          saving={wizard.saving}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      }
    >
      <Suspense fallback={<StepSkeleton />}>{renderStep()}</Suspense>
    </WizardShell>
  );
}
