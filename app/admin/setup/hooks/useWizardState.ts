"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export interface WizardData {
  // Step 1: Company Info
  companyName: string;
  legalName: string;
  entityType: string;
  ein: string;
  yearIncorporated: string;
  jurisdiction: string;
  previousNames: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  badActorCertified: boolean;
  relatedPersons: Array<{ name: string; title: string; relationship: string }>;

  // Step 2: Branding
  brandColor: string;
  accentColor: string;
  customDomain: string;
  customEmail: string;
  description: string;
  sector: string;
  geography: string;
  website: string;
  foundedYear: string;
  logoUrl: string;

  // Step 3: Raise Style
  raiseMode: "GP_FUND" | "STARTUP" | "DATAROOM_ONLY" | "";
  regDExemption: "506B" | "506C" | "REG_A_PLUS" | "RULE_504" | "";
  minInvestment: string;
  sharePrice: string;

  // Step 4: Team Invites
  inviteEmails: string[];
  inviteRoles: string[];

  // Step 5: Dataroom
  dataroomName: string;
  requireEmail: boolean;
  watermark: boolean;
  passwordProtection: boolean;
  linkExpiration: boolean;
  allowDownloads: boolean;
  investButton: boolean;

  // Step 6: Fund Details (GP FUND mode)
  fundName: string;
  targetRaise: string;
  mgmtFee: string;
  carry: string;
  hurdle: string;
  fundTerm: string;
  waterfallType: string;
  fundStrategy: string;
  fundSubType: string;
  currency: string;
  minimumCommitment: string;
  extensionYears: string;
  highWaterMark: boolean;
  gpCommitment: string;
  investmentPeriod: string;
  recyclingEnabled: boolean;
  clawbackProvision: boolean;
  keyPersonEnabled: boolean;
  keyPersonName: string;
  noFaultDivorceThreshold: string;
  mgmtFeeOffset: string;
  preferredReturnMethod: string;
  marketplaceDescription: string;
  marketplaceCategory: string;

  // Step 6: Fund Details (STARTUP mode)
  instrumentType: string;
  roundName: string;
  valCap: string;
  discount: string;
  safeType: string;
  mfn: boolean;
  proRata: boolean;
  interestRate: string;
  maturityDate: string;
  qualFinancing: string;
  preMoneyVal: string;
  liqPref: string;
  antiDilution: string;
  optionPool: string;
  boardSeats: string;
  protectiveProvisions: boolean;
  informationRights: boolean;
  rofrCoSale: boolean;
  dragAlong: boolean;
  spvName: string;
  targetCompanyName: string;
  dealDescription: string;
  allocationAmount: string;
  minimumLpInvestment: string;
  spvMgmtFee: string;
  spvCarry: string;
  spvGpCommitment: string;
  maxInvestors: string;
  spvTerm: string;

  // Step 6: SEC / Investment Company Act
  investmentCompanyExemption: string;
  useOfProceeds: string;
  salesCommissions: string;

  // Step 6: Wire Instructions (both modes)
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  swift: string;
  memoFormat: string;
  wireIntermediaryBank: string;
  wireCurrency: string;
  wireSpecialInstructions: string;

  // Step 7: LP Onboarding
  gpApproval: boolean;
  allowExternalUpload: boolean;
  allowGPUpload: boolean;
  emailLPSteps: boolean;
  emailGPCommitment: boolean;
  emailGPWire: boolean;
  accreditationMethod: string;
  minimumInvestThreshold: string;
  notifyGpLpOnboardingStart: boolean;
  notifyGpExternalDocUpload: boolean;
  notifyGpLpInactive: boolean;
  notifyLpWireConfirm: boolean;
  notifyLpNewDocument: boolean;
  notifyLpChangeRequest: boolean;
  notifyLpOnboardingReminder: boolean;
  documentTemplates: Array<{ type: string; status: string; customFileName?: string }>;

  // Step 6: Funding Structure (STARTUP — planned future rounds)
  plannedRounds: Array<{
    roundName: string;
    targetAmount: string;
    instrumentType: string;
    valuationCap: string;
    discount: string;
    notes: string;
  }>;

  // Step 6: Funding Structure (GP_FUND — initial pricing tiers)
  initialTiers: Array<{
    tranche: number;
    name: string;
    pricePerUnit: string;
    unitsAvailable: string;
  }>;

  // Step 8: Integrations
  auditRetention: string;
  exportFormat: string;
  formDReminder: boolean;

  // Step 9: Launch
  marketplaceInterest: boolean;
}

const DEFAULT_WIZARD_DATA: WizardData = {
  companyName: "",
  legalName: "",
  entityType: "",
  ein: "",
  yearIncorporated: "",
  jurisdiction: "",
  previousNames: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  badActorCertified: false,
  relatedPersons: [],
  brandColor: "#0A1628",
  accentColor: "#0066FF",
  customDomain: "",
  customEmail: "",
  description: "",
  sector: "",
  geography: "",
  website: "",
  foundedYear: "",
  logoUrl: "",
  raiseMode: "",
  regDExemption: "506B",
  minInvestment: "",
  sharePrice: "",
  inviteEmails: [],
  inviteRoles: [],
  dataroomName: "",
  requireEmail: true,
  watermark: true,
  passwordProtection: false,
  linkExpiration: true,
  allowDownloads: false,
  investButton: true,
  fundName: "",
  targetRaise: "",
  mgmtFee: "2.0",
  carry: "20.0",
  hurdle: "8.0",
  fundTerm: "10",
  waterfallType: "",
  fundStrategy: "",
  fundSubType: "",
  currency: "USD",
  minimumCommitment: "",
  extensionYears: "",
  highWaterMark: false,
  gpCommitment: "",
  investmentPeriod: "",
  recyclingEnabled: false,
  clawbackProvision: false,
  keyPersonEnabled: false,
  keyPersonName: "",
  noFaultDivorceThreshold: "",
  mgmtFeeOffset: "",
  preferredReturnMethod: "COMPOUNDED",
  marketplaceDescription: "",
  marketplaceCategory: "",
  instrumentType: "",
  roundName: "",
  valCap: "",
  discount: "20",
  safeType: "POST_MONEY",
  mfn: false,
  proRata: false,
  interestRate: "5.0",
  maturityDate: "",
  qualFinancing: "1000000",
  preMoneyVal: "",
  liqPref: "1X_NON_PARTICIPATING",
  antiDilution: "BROAD_BASED_WEIGHTED_AVG",
  optionPool: "10",
  boardSeats: "",
  protectiveProvisions: false,
  informationRights: false,
  rofrCoSale: false,
  dragAlong: false,
  spvName: "",
  targetCompanyName: "",
  dealDescription: "",
  allocationAmount: "",
  minimumLpInvestment: "",
  spvMgmtFee: "",
  spvCarry: "20",
  spvGpCommitment: "",
  maxInvestors: "",
  spvTerm: "",
  investmentCompanyExemption: "",
  useOfProceeds: "",
  salesCommissions: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  routingNumber: "",
  swift: "",
  memoFormat: "",
  wireIntermediaryBank: "",
  wireCurrency: "USD",
  wireSpecialInstructions: "",
  gpApproval: true,
  allowExternalUpload: true,
  allowGPUpload: true,
  emailLPSteps: true,
  emailGPCommitment: true,
  emailGPWire: true,
  accreditationMethod: "SELF_ACK",
  minimumInvestThreshold: "",
  notifyGpLpOnboardingStart: true,
  notifyGpExternalDocUpload: true,
  notifyGpLpInactive: true,
  notifyLpWireConfirm: true,
  notifyLpNewDocument: true,
  notifyLpChangeRequest: true,
  notifyLpOnboardingReminder: true,
  documentTemplates: [],
  plannedRounds: [],
  initialTiers: [],
  auditRetention: "7",
  exportFormat: "CSV",
  formDReminder: true,
  marketplaceInterest: false,
};

const STORAGE_KEY = "fundroom_gp_wizard_state";

export function useWizardState() {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(DEFAULT_WIZARD_DATA);
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData((prev) => ({ ...prev, ...parsed.data }));
        if (typeof parsed.step === "number") {
          setCurrentStep(parsed.step);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (!initialized.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ data, step: currentStep }),
      );
    } catch {
      // Ignore storage errors
    }
  }, [data, currentStep]);

  const updateField = useCallback(
    <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
      setData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const updateFields = useCallback((fields: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...fields }));
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => prev + 1);
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const clearState = useCallback(() => {
    setData(DEFAULT_WIZARD_DATA);
    setCurrentStep(0);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Save step data to server
  const saveStep = useCallback(
    async (stepIndex: number) => {
      setSaving(true);
      try {
        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: stepIndex, data }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to save");
        }
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [data],
  );

  return {
    currentStep,
    setCurrentStep,
    data,
    updateField,
    updateFields,
    nextStep,
    prevStep,
    goToStep,
    clearState,
    saveStep,
    saving,
  };
}
