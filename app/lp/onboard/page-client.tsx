"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Mail,
  User,
  CheckCircle2,
  Shield,
  FileText,
  Landmark,
  PenIcon,
  DollarSign,
  Loader2,
  Banknote,
} from "lucide-react";

import type { EntityType } from "@/lib/entity";
import { useOnboardingFlow } from "@/lib/hooks/use-onboarding-flow";
import type { InvestorEntityData } from "@/lib/validations/investor-entity";

// Lazy-loaded step components — all steps use React.lazy for code splitting
const PersonalInfoStep = React.lazy(() => import("./steps/PersonalInfoStep"));
const AddressStep = React.lazy(() => import("./steps/AddressStep"));
const AccreditationStep = React.lazy(() => import("./steps/AccreditationStep"));
const NDAStep = React.lazy(() => import("./steps/NDAStep"));
const CommitmentStep = React.lazy(() => import("./steps/CommitmentStep"));
const InvestorTypeStep = React.lazy(() => import("@/components/onboarding/InvestorTypeStep"));
const FundingStep = React.lazy(() => import("@/components/onboarding/FundingStep").then(m => ({ default: m.FundingStep })));
const SequentialSigningFlow = React.lazy(() => import("@/components/signature/sequential-signing-flow").then(m => ({ default: m.SequentialSigningFlow })));

// Types and validation helpers (imported synchronously)
import type { FormData, FundContext, TrancheData } from "./steps/types";
import { canProceedStep1 } from "./steps/PersonalInfoStep";
import { canProceedStep4 } from "./steps/AccreditationStep";
import { canProceedStep5 } from "./steps/NDAStep";

const INITIAL_FORM: FormData = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  entityType: "INDIVIDUAL",
  entityName: "",
  stateOfFormation: "",
  authorizedSignatory: "",
  signatoryTitle: "",
  trustType: "",
  trusteeName: "",
  governingState: "",
  accountType: "",
  custodianName: "",
  otherTypeDescription: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  accreditationType: "",
  confirmAccredited: false,
  confirmRiskAware: false,
  noThirdPartyFinancing: false,
  sourceOfFunds: "",
  occupation: "",
  ndaAccepted: false,
  ndaSignatureMethod: "",
  ndaTypedName: "",
  commitmentAmount: "",
  repAccreditedCert: false,
  repPrincipal: false,
  repOfferingDocs: false,
  repRiskAware: false,
  repRestrictedSecurities: false,
  repAmlOfac: false,
  repTaxConsent: false,
  repIndependentAdvice: false,
};

/**
 * Visible step indicators for the progress bar.
 * Internal step numbering (1-9) remains unchanged for backward compatibility
 * with auto-save and resume logic. The progress bar maps internal steps to
 * 6 visible indicators.
 *
 * Internal flow: 1-Account → 2-Entity → 3-Address → 4-Accreditation →
 *   5-NDA → 6-Commitment → 7-Signing → 8-Funding → 9-Email
 *
 * Entity collects before NDA so entity details can autofill NDA fields.
 * NDA is grouped with Commitment (both are agreement/commitment actions).
 *
 * Visible grouping: Account | Entity | Accreditation | Commit | Sign | Fund
 */
const VISIBLE_STEPS = [
  { label: "Account", icon: User, internalSteps: [1] },
  { label: "Entity", icon: Building2, internalSteps: [2, 3] },
  { label: "Accreditation", icon: Shield, internalSteps: [4] },
  { label: "Commit", icon: DollarSign, internalSteps: [5, 6] },
  { label: "Sign", icon: PenIcon, internalSteps: [7] },
  { label: "Fund", icon: Landmark, internalSteps: [8, 9] },
];

/** Map internal step number to visible step index (0-based) */
function getVisibleStepIndex(internalStep: number): number {
  const idx = VISIBLE_STEPS.findIndex((vs) => vs.internalSteps.includes(internalStep));
  return idx >= 0 ? idx : 0;
}

/** Suspense fallback for lazy-loaded steps */
function StepLoadingFallback() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading step content">
      <div className="space-y-2">
        <div className="h-4 w-24 bg-gray-700 rounded" />
        <div className="h-10 w-full bg-gray-700/50 rounded-md" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-32 bg-gray-700 rounded" />
        <div className="h-10 w-full bg-gray-700/50 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="h-4 w-20 bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-700/50 rounded-md" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-700/50 rounded-md" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-28 bg-gray-700 rounded" />
        <div className="h-10 w-full bg-gray-700/50 rounded-md" />
      </div>
    </div>
  );
}

export default function LPOnboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");
  const isSubmittingRef = useRef(false);
  const [fundContext, setFundContext] = useState<FundContext | null>(null);
  const refName = searchParams?.get("ref") ?? null;
  const [isRegistered, setIsRegistered] = useState(false);
  const {
    currentStep: savedStep,
    stepData: savedData,
    isLoading: resumeLoading,
    saveProgress,
    markComplete,
  } = useOnboardingFlow(fundContext?.fundId);
  const initializedFromHook = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [entityStepData, setEntityStepData] = useState<Record<string, unknown> | null>(null);
  const [commitError, setCommitError] = useState<{ type: string; step: number } | null>(null);
  const [commitUnits, setCommitUnits] = useState(1);
  const [trancheData, setTrancheData] = useState<TrancheData | null>(null);
  const [trancheLoading, setTrancheLoading] = useState(false);

  const [fundContextError, setFundContextError] = useState("");
  const [brandingData, setBrandingData] = useState<{
    logo?: string;
    brandColor?: string;
    orgName?: string;
  } | null>(null);
  const [ndaSignatureDataUrl, setNdaSignatureDataUrl] = useState<string | null>(null);

  // Fetch fund context from teamId or fundId query param (passed from dataroom CTA / InvestButton)
  useEffect(() => {
    const teamId = searchParams?.get("teamId");
    const fundIdParam = searchParams?.get("fundId");
    if (!teamId && !fundIdParam) return;

    const params = new URLSearchParams();
    if (fundIdParam) params.set("fundId", fundIdParam);
    if (teamId) params.set("teamId", teamId);

    fetch(`/api/lp/fund-context?${params.toString()}`)
      .then(async (res) => {
        if (res.ok) return res.json();
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load fund information");
      })
      .then((data) => {
        if (data) setFundContext(data);
      })
      .catch((err) => {
        setFundContextError(
          err instanceof Error ? err.message : "Unable to load fund details. You can still create an account."
        );
      });
  }, [searchParams]);

  // Fetch branding from fund context when available
  useEffect(() => {
    if (!fundContext?.teamId) return;
    fetch(`/api/branding/tenant?teamId=${fundContext.teamId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setBrandingData({
            logo: data.logo || undefined,
            brandColor: data.brandColor || undefined,
            orgName: fundContext.orgName || undefined,
          });
        }
      })
      .catch((e) => console.error("Failed to load branding:", e));
  }, [fundContext?.teamId, fundContext?.orgName]);

  // Fetch tranche data when entering commitment step
  useEffect(() => {
    if (step !== 6 || !fundContext?.fundId || trancheData) return;
    setTrancheLoading(true);
    fetch(`/api/lp/current-tranche?fundId=${fundContext.fundId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setTrancheData(data);
        }
      })
      .catch((e) => console.error("Failed to load tranche data:", e))
      .finally(() => setTrancheLoading(false));
  }, [step, fundContext?.fundId, trancheData]);

  // Auto-save: debounced save of form data after changes (only if fund context exists)
  const saveOnboardingProgress = useCallback(async () => {
    if (!fundContext?.fundId || step >= 9) return;
    const stepsCompleted = {
      personal_info: step > 1,
      entity_type: step > 2,
      address: step > 3,
      accreditation: step > 4,
      agreement: step > 5,
      commitment: step > 6,
      signing: step > 7,
      funding: step > 8,
    };
    await saveProgress(step, formData as unknown as Record<string, unknown>, stepsCompleted);
  }, [fundContext?.fundId, step, formData, saveProgress]);

  // Debounced auto-save on form data changes
  useEffect(() => {
    if (!fundContext?.fundId || step >= 9) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveOnboardingProgress();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, step, saveOnboardingProgress, fundContext?.fundId]);

  // Initialize wizard from saved onboarding flow (runs once after hook loads)
  useEffect(() => {
    if (resumeLoading || initializedFromHook.current || !fundContext?.fundId) return;
    initializedFromHook.current = true;

    if (savedStep > 1) {
      setStep(savedStep);
    }
    if (savedData && Object.keys(savedData).length > 0) {
      setFormData((prev) => ({ ...prev, ...(savedData as Partial<FormData>) }));
    }
  }, [resumeLoading, savedStep, savedData, fundContext?.fundId]);

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const PO_BOX_PATTERN = /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|box\s+\d+)\b/i;

  const validateAddress = (): boolean => {
    if (formData.street1 && PO_BOX_PATTERN.test(formData.street1)) {
      setAddressError("PO Box addresses are not accepted. A physical street address is required.");
      return false;
    }
    if (formData.street2 && PO_BOX_PATTERN.test(formData.street2)) {
      setAddressError("PO Box addresses are not accepted.");
      return false;
    }
    setAddressError("");
    return true;
  };

  const handleNext = () => {
    setError("");
    if (step === 3 && !validateAddress()) return;
    if (step === 1) {
      setStep(2);
      return;
    }
    setStep((s) => Math.min(s + 1, 9));
  };

  const handleBack = () => {
    setError("");
    setAddressError("");
    // From step 4 (accreditation), go back to step 2 (entity) since step 3 (address) is now collected in step 2
    if (step === 4) {
      setStep(2);
      return;
    }
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isLoading) return;

    setError("");
    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      const response = await fetch("/api/lp/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          password: formData.password || undefined,
          entityType: formData.entityType,
          entityName: formData.entityType !== "INDIVIDUAL" ? formData.entityName : undefined,
          entityData: buildEntityData(),
          address: formData.street1 ? {
            street1: formData.street1,
            street2: formData.street2 || undefined,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
            country: formData.country,
          } : undefined,
          accreditationType: formData.accreditationType,
          ndaAccepted: formData.ndaAccepted,
          sourceOfFunds: formData.sourceOfFunds || undefined,
          occupation: formData.occupation || undefined,
          fundId: fundContext?.fundId || undefined,
          teamId: fundContext?.teamId || searchParams?.get("teamId") || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Registration failed");
      }

      const regData = await response.json();
      setIsRegistered(true);

      // Use one-time login token for immediate session creation.
      let sessionCreated = false;
      if (regData.loginToken) {
        try {
          const tokenRes = await fetch("/api/auth/lp-token-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: regData.loginToken }),
          });

          if (tokenRes.ok) {
            sessionCreated = true;
          }
        } catch {
          // Token login failed — fall through to magic link
        }
      }

      if (!sessionCreated) {
        // No active session — send magic link email and show a waiting message.
        // The magic link is async so the user must check their email before
        // proceeding to authenticated steps (commitment, wire proof, etc.).
        await signIn("email", {
          email: formData.email,
          redirect: false,
          callbackUrl: `/lp/onboard?fundId=${fundContext?.fundId || ""}&teamId=${fundContext?.teamId || searchParams?.get("teamId") || ""}`,
        });
        setError(
          "We've sent a verification link to your email. Please check your inbox and click the link to continue your investment."
        );
        isSubmittingRef.current = false;
        return; // Don't advance — user must verify email first
      }

      // Fire-and-forget: Record NDA signing with signature method details
      if (formData.ndaAccepted) {
        fetch("/api/lp/sign-nda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fundId: fundContext?.fundId || undefined,
            ndaAccepted: true,
            signatureMethod: formData.ndaSignatureMethod || "CHECKBOX",
            signatureData: formData.ndaSignatureMethod === "TYPED"
              ? { typedName: formData.ndaTypedName }
              : formData.ndaSignatureMethod === "DRAWN"
                ? { hasDrawnSignature: true }
                : undefined,
          }),
        }).catch((e) => console.error("Failed to sign NDA:", e));
      }

      // Move to commitment step
      setStep(6);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
      isSubmittingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSigningComplete = async () => {
    setStep(8);
  };

  const handleFundingComplete = async () => {
    await markComplete();
    setStep(9);
  };

  const handleCommitmentSubmit = async () => {
    if (!fundContext?.fundId) return;

    const isFlatMode = fundContext.flatModeEnabled || !trancheData?.activeTranche;
    if (!isFlatMode && !trancheData?.activeTranche) return;

    setIsLoading(true);
    setError("");

    try {
      const totalAmount = isFlatMode
        ? parseFloat(formData.commitmentAmount)
        : commitUnits * trancheData!.activeTranche!.pricePerUnit;

      if (isNaN(totalAmount) || totalAmount <= 0) {
        setError("Please enter a valid commitment amount.");
        setIsLoading(false);
        return;
      }

      if (fundContext.minimumInvestment && totalAmount < fundContext.minimumInvestment) {
        setError(`Minimum investment is $${fundContext.minimumInvestment.toLocaleString()}`);
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/lp/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundId: fundContext.fundId,
          units: isFlatMode ? undefined : commitUnits,
          amount: totalAmount,
          representations: {
            accreditedCert: formData.repAccreditedCert,
            principal: formData.repPrincipal,
            offeringDocs: formData.repOfferingDocs,
            riskAware: formData.repRiskAware,
            restrictedSecurities: formData.repRestrictedSecurities,
            amlOfac: formData.repAmlOfac,
            taxConsent: formData.repTaxConsent,
            independentAdvice: formData.repIndependentAdvice,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Subscription failed");
      }

      const result = await response.json();

      setFormData((prev) => ({
        ...prev,
        commitmentAmount: totalAmount.toString(),
        investmentId: result.investment?.id || prev.investmentId,
      }));

      await saveProgress(
        7,
        {
          ...formData,
          commitmentAmount: totalAmount.toString(),
          investmentId: result.investment?.id,
        } as Record<string, unknown>,
        {
          personal_info: true,
          entity_type: true,
          address: true,
          accreditation: true,
          agreement: true,
          commitment: true,
        },
      );

      setStep(7);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      if (message.toLowerCase().includes("nda")) {
        setError("Please complete the NDA agreement step before committing.");
        setCommitError({ type: "nda", step: 5 });
      } else if (message.toLowerCase().includes("accreditation")) {
        setError("Please confirm your accredited investor status before committing.");
        setCommitError({ type: "accreditation", step: 4 });
      } else {
        setError(message);
        setCommitError(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  function buildEntityData(): Record<string, string> {
    const data: Record<string, string> = {};
    switch (formData.entityType) {
      case "LLC":
        if (formData.stateOfFormation) data.stateOfFormation = formData.stateOfFormation;
        if (formData.authorizedSignatory) data.authorizedSignatory = formData.authorizedSignatory;
        if (formData.signatoryTitle) data.signatoryTitle = formData.signatoryTitle;
        break;
      case "TRUST":
        if (formData.trustType) data.trustType = formData.trustType;
        if (formData.trusteeName) data.trusteeName = formData.trusteeName;
        if (formData.governingState) data.governingState = formData.governingState;
        break;
      case "RETIREMENT":
        if (formData.accountType) data.accountType = formData.accountType;
        if (formData.custodianName) data.custodianName = formData.custodianName;
        break;
      case "OTHER":
        if (formData.otherTypeDescription) data.otherTypeDescription = formData.otherTypeDescription;
        if (formData.authorizedSignatory) data.authorizedSignatory = formData.authorizedSignatory;
        if (formData.signatoryTitle) data.signatoryTitle = formData.signatoryTitle;
        break;
    }
    return data;
  }

  // Handler for the InvestorTypeStep component when entity data is submitted
  const handleEntityStepNext = useCallback(
    (entityData: InvestorEntityData, rawForm: unknown) => {
      setEntityStepData(rawForm as Record<string, unknown>);

      const entityType = entityData.entityType as EntityType;
      setFormData((prev) => {
        const updates: Partial<FormData> = { entityType };

        switch (entityType) {
          case "INDIVIDUAL":
            if ("firstName" in entityData && "lastName" in entityData) {
              updates.entityName = "";
            }
            break;
          case "LLC":
            if ("legalName" in entityData) updates.entityName = entityData.legalName;
            if ("stateOfFormation" in entityData) updates.stateOfFormation = entityData.stateOfFormation || "";
            if ("signatoryName" in entityData) updates.authorizedSignatory = entityData.signatoryName;
            if ("signatoryTitle" in entityData) updates.signatoryTitle = entityData.signatoryTitle;
            break;
          case "TRUST":
            if ("legalName" in entityData) updates.entityName = entityData.legalName;
            if ("trustType" in entityData) updates.trustType = entityData.trustType || "";
            if ("trusteeName" in entityData) updates.trusteeName = entityData.trusteeName;
            if ("governingState" in entityData) updates.governingState = entityData.governingState || "";
            break;
          case "RETIREMENT":
            if ("accountTitle" in entityData) updates.entityName = entityData.accountTitle;
            if ("accountType" in entityData) updates.accountType = entityData.accountType;
            if ("custodianName" in entityData) updates.custodianName = entityData.custodianName;
            break;
          case "OTHER":
            if ("legalName" in entityData) updates.entityName = entityData.legalName;
            if ("otherEntityType" in entityData) updates.otherTypeDescription = entityData.otherEntityType || "";
            if ("signatoryName" in entityData) updates.authorizedSignatory = entityData.signatoryName;
            if ("signatoryTitle" in entityData) updates.signatoryTitle = entityData.signatoryTitle;
            break;
        }

        if ("address" in entityData && entityData.address) {
          updates.street1 = entityData.address.street1;
          updates.street2 = entityData.address.street2 || "";
          updates.city = entityData.address.city;
          updates.state = entityData.address.state;
          updates.zip = entityData.address.zip;
          updates.country = entityData.address.country;
        }

        return { ...prev, ...updates };
      });

      // Skip address step — InvestorTypeStep now collects address
      setStep(4);
    },
    []
  );

  // Fire-and-forget per-checkbox audit event for SEC compliance
  const logCertificationAudit = useCallback(
    (
      certificationIndex: number,
      certificationField: string,
      certificationText: string,
      checked: boolean,
      certificationCategory: string = "STANDARD",
    ) => {
      fetch("/api/lp/accreditation-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundId: fundContext?.fundId || undefined,
          certificationIndex,
          certificationField,
          certificationText,
          checked,
          certificationCategory,
        }),
      }).catch((e) => console.error("Failed to capture NDA:", e));
    },
    [fundContext?.fundId],
  );

  if (resumeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
        <p className="text-gray-400 text-sm">Resuming your progress...</p>
      </div>
    );
  }

  // Paywall gate: if fund context is loaded and FundRoom is not active, show blocked message
  if (fundContext && fundContext.fundroomActive === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <Link href="/" className="inline-block mb-6">
            <h1 className="text-3xl font-bold text-white">FundRoom</h1>
          </Link>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
              <Shield className="h-7 w-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">
              Not Yet Accepting Investments
            </h2>
            <p className="text-gray-400 mb-6">
              This fund is not yet accepting investments. Contact the fund administrator for more information.
            </p>
            <Button
              onClick={() => router.push("/login")}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Return to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Missing fund gate: if fund context loaded but no fund ID resolved, show clear error
  if (fundContext && !fundContext.fundId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <Link href="/" className="inline-block mb-6">
            <h1 className="text-3xl font-bold text-white">FundRoom</h1>
          </Link>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
              <Shield className="h-7 w-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">
              No Active Fund
            </h2>
            <p className="text-gray-400 mb-6">
              This organization does not have an active fund accepting investments at this time.
              Please contact the fund administrator for more information.
            </p>
            <Button
              onClick={() => router.push("/login")}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Return to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Compute validation states for the form navigation buttons
  const canProceed1 = canProceedStep1(formData);
  const canProceed4 = canProceedStep4(formData, fundContext);
  const canProceed5 = canProceedStep5(formData, ndaSignatureDataUrl);
  const canProceedStep3 = true; // Address is optional during onboarding

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-4 overflow-x-hidden">
      <div className="w-full max-w-lg">
        {/* Fund-branded header: GP logo + fund name + "Powered by FundRoom" */}
        <div className="text-center mb-8">
          {brandingData?.logo ? (
            <div className="mb-3">
              <img
                src={brandingData.logo}
                alt={brandingData.orgName || "Fund"}
                className="h-12 mx-auto object-contain"
              />
            </div>
          ) : (
            <Link href="/" className="inline-block">
              <h1 className="text-3xl font-bold text-white">FundRoom</h1>
            </Link>
          )}
          {fundContext?.orgName || refName ? (
            <p className="text-gray-400 mt-2">
              Investor Portal{fundContext?.orgName ? ` — ${fundContext.orgName}` : refName ? ` — ${decodeURIComponent(refName)}` : ""}
            </p>
          ) : (
            <p className="text-gray-400 mt-2">Investor Portal</p>
          )}
          {fundContext?.fundName && (
            <p className="text-sm mt-1" style={{ color: brandingData?.brandColor || "#10B981" }}>
              Onboarding for: {fundContext.fundName}
            </p>
          )}
          {brandingData?.logo && (
            <p className="text-gray-600 text-xs mt-2">Powered by FundRoom</p>
          )}
        </div>

        {/* Fund context warning */}
        {fundContextError && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-amber-400 text-sm">{fundContextError}</p>
          </div>
        )}

        {/* Step indicators — 6 visible steps, scrollable on small screens */}
        <div className="flex justify-center mb-8 overflow-x-auto scrollbar-hide -mx-4 px-4">
          <div className="flex gap-1 min-w-0">
            {VISIBLE_STEPS.map((vs, i) => {
              const visibleIdx = getVisibleStepIndex(step);
              const isComplete = i < visibleIdx;
              const isActive = i === visibleIdx;
              const StepIcon = vs.icon;
              return (
                <div key={vs.label} className="flex items-center flex-shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors ${
                        isComplete || isActive
                          ? "text-white"
                          : "bg-gray-700 text-gray-400"
                      }`}
                      style={(isComplete || isActive) ? { backgroundColor: brandingData?.brandColor || "#059669" } : undefined}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                      ) : (
                        <StepIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                    </div>
                    <span className={`text-[10px] sm:text-xs whitespace-nowrap ${
                      isComplete || isActive ? "text-gray-200" : "text-gray-500"
                    }`}>
                      {vs.label}
                    </span>
                  </div>
                  {i < VISIBLE_STEPS.length - 1 && (
                    <div
                      className={`w-4 sm:w-6 h-0.5 mt-[-12px] sm:mt-[-14px] ${
                        isComplete ? "bg-emerald-600" : "bg-gray-700"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">
              {step === 1 && "Welcome, Investor"}
              {step === 2 && "Entity Information"}
              {step === 3 && "Mailing Address"}
              {step === 4 && "Accreditation"}
              {step === 5 && "Investor Agreement"}
              {step === 6 && "Investment Commitment"}
              {step === 7 && "Sign Documents"}
              {step === 8 && "Fund Your Investment"}
              {step === 9 && "Onboarding Complete"}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {step === 1 && "Enter your name and email to get started"}
              {step === 2 && "How are you investing?"}
              {step === 3 && "Physical address for SEC filings (optional now, required before signing)"}
              {step === 4 && "506(c) requires verification of accredited investor status"}
              {step === 5 && "Review and accept the investor terms"}
              {step === 6 && "Select the number of units you'd like to commit"}
              {step === 7 && "Review and sign your fund documents"}
              {step === 8 && "Wire transfer instructions and proof of payment"}
              {step === 9 && "Your onboarding is complete — proceed to your dashboard"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Step 9: Onboarding complete */}
            {step === 9 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
                <p className="text-white font-medium text-lg mb-2">
                  Onboarding Complete!
                </p>
                <p className="text-gray-300 mb-6">
                  Your account is set up and documents are submitted. You can
                  track your investment status and access fund documents from
                  your dashboard.
                </p>
                <Button
                  onClick={() => router.push("/lp/dashboard")}
                  className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                >
                  Go to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : step === 8 ? (
              /* Step 8: Funding — Wire Transfer Instructions + Proof Upload */
              <FundingStep
                fundId={fundContext?.fundId || ""}
                teamId={fundContext?.teamId || ""}
                investmentId={formData.investmentId || undefined}
                investorName={formData.name}
                fundName={fundContext?.fundName || undefined}
                commitmentAmount={
                  formData.commitmentAmount
                    ? parseFloat(formData.commitmentAmount)
                    : undefined
                }
                onComplete={handleFundingComplete}
                onBack={() => setStep(7)}
              />
            ) : step === 7 ? (
              /* Step 7: Document Signing */
              <div className="min-h-[300px]">
                <SequentialSigningFlow
                  onComplete={handleSigningComplete}
                  fundId={fundContext?.fundId || undefined}
                />
              </div>
            ) : step === 6 ? (
              /* Step 6: Investment Commitment — Tranche-Aware */
              <Suspense fallback={<StepLoadingFallback />}>
                <CommitmentStep
                  formData={formData}
                  updateField={updateField}
                  fundContext={fundContext}
                  trancheData={trancheData}
                  trancheLoading={trancheLoading}
                  commitUnits={commitUnits}
                  onCommitUnitsChange={setCommitUnits}
                  isLoading={isLoading}
                  error={error}
                  commitError={commitError}
                  onCommit={handleCommitmentSubmit}
                  onBack={handleBack}
                  onClearError={() => { setError(""); setCommitError(null); }}
                  onGoToStep={setStep}
                  logCertificationAudit={logCertificationAudit}
                />
              </Suspense>
            ) : (
              <form
                onSubmit={step === 5 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}
              >
                {/* Step 1: Create Account — Personal Info + Password */}
                {step === 1 && (
                  <Suspense fallback={<StepLoadingFallback />}>
                    <PersonalInfoStep
                      formData={formData}
                      updateField={updateField}
                    />
                  </Suspense>
                )}

                {/* Step 2: Entity Type — Full InvestorTypeStep component */}
                {step === 2 && (
                  <InvestorTypeStep
                    initialData={entityStepData as Record<string, unknown> | undefined}
                    onAutoSave={(data) => {
                      saveProgress(2, data as unknown as Record<string, unknown>, {
                        personal_info: true,
                        entity_type: false,
                      }).catch((e) => console.error("Failed to save progress:", e));
                    }}
                    onNext={handleEntityStepNext}
                    onBack={handleBack}
                    isLoading={isLoading}
                  />
                )}

                {/* Step 3: Mailing Address */}
                {step === 3 && (
                  <Suspense fallback={<StepLoadingFallback />}>
                    <AddressStep
                      formData={formData}
                      updateField={updateField}
                      addressError={addressError}
                    />
                  </Suspense>
                )}

                {/* Step 4: Accreditation */}
                {step === 4 && (
                  <Suspense fallback={<StepLoadingFallback />}>
                    <AccreditationStep
                      formData={formData}
                      updateField={updateField}
                      fundContext={fundContext}
                      logCertificationAudit={logCertificationAudit}
                    />
                  </Suspense>
                )}

                {/* Step 5: NDA E-Signature */}
                {step === 5 && (
                  <Suspense fallback={<StepLoadingFallback />}>
                    <NDAStep
                      formData={formData}
                      updateField={updateField}
                      ndaSignatureDataUrl={ndaSignatureDataUrl}
                      onSignatureDataUrlChange={setNdaSignatureDataUrl}
                    />
                  </Suspense>
                )}

                {/* Step 2 (InvestorTypeStep) has its own error display and navigation */}
                {step !== 2 && error && (
                  <p className="text-red-400 text-sm mt-4">{error}</p>
                )}

                {step !== 2 && (
                  <div className="flex gap-2 mt-6">
                    {step > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-[44px] text-gray-400 hover:text-white"
                        onClick={handleBack}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                    )}
                    <Button
                      type="submit"
                      className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                      disabled={
                        isLoading ||
                        (step === 1 && !canProceed1) ||
                        (step === 3 && !canProceedStep3) ||
                        (step === 4 && !canProceed4) ||
                        (step === 5 && !canProceed5)
                      }
                    >
                      {isLoading ? (
                        "Processing..."
                      ) : step === 5 ? (
                        "Create Account & Continue"
                      ) : (
                        <>
                          Continue
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-gray-500 text-sm mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-500 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
