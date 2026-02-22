"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  User,
  Building2,
  Shield,
  Landmark,
  Briefcase,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  type InvestorEntityData,
  type AddressData,
} from "@/lib/validations/investor-entity";
import {
  IndividualForm,
  LLCForm,
  TrustForm,
  RetirementForm,
  OtherEntityForm,
  type EntityFormState,
  type EntityType,
  type AddressState,
  EMPTY_ADDRESS,
} from "./entity-forms";

// --- Constants ---

const PO_BOX_PATTERN =
  /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|pmb\s+\d+|hc\s+\d+|general\s+delivery|box\s+\d+)\b/i;

const ENTITY_CARDS = [
  {
    type: "INDIVIDUAL" as const,
    label: "Individual",
    description: "Investing in your personal name",
    icon: User,
  },
  {
    type: "LLC" as const,
    label: "LLC",
    description: "Investing through a limited liability company",
    icon: Building2,
  },
  {
    type: "TRUST" as const,
    label: "Trust",
    description: "Investing through a trust",
    icon: Shield,
  },
  {
    type: "RETIREMENT" as const,
    label: "401k / IRA",
    description: "Investing through a retirement account",
    icon: Landmark,
  },
  {
    type: "OTHER" as const,
    label: "Other Entity",
    description: "Corporation, LP, or other entity type",
    icon: Briefcase,
  },
];

const INITIAL_STATE: EntityFormState = {
  entityType: "INDIVIDUAL",
  firstName: "",
  lastName: "",
  ssn: "",
  dateOfBirth: "",
  llcName: "",
  llcEin: "",
  llcStateOfFormation: "",
  llcDateOfFormation: "",
  llcCountryOfFormation: "US",
  llcTaxClassification: "",
  trustName: "",
  trustType: "",
  trustTaxId: "",
  trustDateEstablished: "",
  trustGoverningState: "",
  trusteeName: "",
  trusteeTitle: "Trustee",
  trusteeEmail: "",
  trusteePhone: "",
  retAccountType: "",
  retAccountTitle: "",
  retCustodianName: "",
  retCustodianAccountNumber: "",
  retCustodianEin: "",
  retCustodianContactName: "",
  retCustodianContactPhone: "",
  retCustodianContactEmail: "",
  retAccountHolderName: "",
  retAccountHolderSsn: "",
  retAccountHolderDob: "",
  retAccountHolderPhone: "",
  retAccountHolderEmail: "",
  retCustodianCoSign: true,
  otherEntityName: "",
  otherEntityType: "",
  otherEin: "",
  otherStateOfFormation: "",
  otherCountryOfFormation: "US",
  otherDateOfFormation: "",
  otherTaxClassification: "",
  physicalAddress: { ...EMPTY_ADDRESS },
  useMailingAddress: false,
  mailingAddress: { ...EMPTY_ADDRESS },
  custodianAddress: { ...EMPTY_ADDRESS },
  signatoryName: "",
  signatoryTitle: "",
  signatoryEmail: "",
  signatoryPhone: "",
  signatoryIsAccountHolder: false,
  phone: "",
};

// --- Props ---

interface InvestorTypeStepProps {
  /** Initial form data (for resume / prefill) */
  initialData?: Partial<EntityFormState>;
  /** Called on field blur for auto-save */
  onAutoSave?: (data: EntityFormState) => void;
  /** Called when user clicks Next with validated data */
  onNext: (data: InvestorEntityData, raw: EntityFormState) => void;
  /** Called when user clicks Back */
  onBack: () => void;
  /** Investor profile ID for API persistence */
  profileId?: string;
  /** Whether form is currently submitting */
  isLoading?: boolean;
}

export default function InvestorTypeStep({
  initialData,
  onAutoSave,
  onNext,
  onBack,
  profileId,
  isLoading = false,
}: InvestorTypeStepProps) {
  const [form, setForm] = useState<EntityFormState>(() => ({
    ...INITIAL_STATE,
    ...initialData,
    physicalAddress: {
      ...EMPTY_ADDRESS,
      ...initialData?.physicalAddress,
    },
    mailingAddress: {
      ...EMPTY_ADDRESS,
      ...initialData?.mailingAddress,
    },
    custodianAddress: {
      ...EMPTY_ADDRESS,
      ...initialData?.custodianAddress,
    },
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSsn, setShowSsn] = useState(false);
  const [showEin, setShowEin] = useState(false);
  const [addressErrors, setAddressErrors] = useState<Record<string, string>>({});

  // Track which fields user has touched for progressive validation
  const touchedRef = useRef<Set<string>>(new Set());

  const updateField = useCallback(
    <K extends keyof EntityFormState>(field: K, value: EntityFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear error for this field
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  const updateAddress = useCallback(
    (
      which: "physicalAddress" | "mailingAddress" | "custodianAddress",
      field: keyof AddressState,
      value: string
    ) => {
      setForm((prev) => ({
        ...prev,
        [which]: { ...prev[which], [field]: value },
      }));
      setAddressErrors((prev) => {
        const next = { ...prev };
        delete next[`${which}.${field}`];
        return next;
      });
    },
    []
  );

  // Auto-save on blur
  const handleBlur = useCallback(
    (fieldName: string) => {
      touchedRef.current.add(fieldName);
      onAutoSave?.(form);
    },
    [form, onAutoSave]
  );

  // Validate PO Box on address field blur
  const handleAddressBlur = useCallback(
    (
      which: "physicalAddress" | "mailingAddress" | "custodianAddress",
      field: "street1" | "street2"
    ) => {
      const value = form[which][field];
      if (value && PO_BOX_PATTERN.test(value)) {
        setAddressErrors((prev) => ({
          ...prev,
          [`${which}.${field}`]:
            "A physical street address is required for regulatory compliance.",
        }));
      } else {
        setAddressErrors((prev) => {
          const next = { ...prev };
          delete next[`${which}.${field}`];
          return next;
        });
      }
      handleBlur(`${which}.${field}`);
    },
    [form, handleBlur]
  );

  // --- Progress calculation ---
  const countFields = (): { filled: number; required: number; optional: number } => {
    let filled = 0;
    let required = 0;
    let optional = 0;

    const checkField = (val: string | boolean | undefined, isRequired: boolean) => {
      if (isRequired) required++;
      else optional++;
      if (val && (typeof val === "boolean" || (typeof val === "string" && val.trim()))) {
        filled++;
      }
    };

    const checkAddr = (addr: AddressState, isRequired: boolean) => {
      checkField(addr.street1, isRequired);
      checkField(addr.city, isRequired);
      checkField(addr.state, isRequired);
      checkField(addr.zip, isRequired);
    };

    switch (form.entityType) {
      case "INDIVIDUAL":
        checkField(form.firstName, true);
        checkField(form.lastName, true);
        checkField(form.ssn, true);
        checkField(form.dateOfBirth, false);
        checkAddr(form.physicalAddress, true);
        checkField(form.phone, false);
        break;
      case "LLC":
        checkField(form.llcName, true);
        checkField(form.llcEin, true);
        checkField(form.llcStateOfFormation, false);
        checkField(form.llcDateOfFormation, false);
        checkField(form.llcTaxClassification, false);
        checkAddr(form.physicalAddress, true);
        checkField(form.signatoryName, true);
        checkField(form.signatoryTitle, true);
        checkField(form.signatoryEmail, true);
        checkField(form.signatoryPhone, false);
        break;
      case "TRUST":
        checkField(form.trustName, true);
        checkField(form.trustType, false);
        checkField(form.trustTaxId, false);
        checkField(form.trustDateEstablished, false);
        checkField(form.trustGoverningState, false);
        checkAddr(form.physicalAddress, true);
        checkField(form.trusteeName, true);
        checkField(form.trusteeEmail, true);
        checkField(form.trusteePhone, false);
        break;
      case "RETIREMENT":
        checkField(form.retAccountType, true);
        checkField(form.retAccountTitle, true);
        checkField(form.retCustodianName, true);
        checkField(form.retCustodianAccountNumber, true);
        checkField(form.retCustodianEin, false);
        checkField(form.retAccountHolderName, true);
        checkField(form.retAccountHolderSsn, false);
        checkField(form.retAccountHolderDob, false);
        break;
      case "OTHER":
        checkField(form.otherEntityName, true);
        checkField(form.otherEntityType, false);
        checkField(form.otherEin, true);
        checkAddr(form.physicalAddress, true);
        checkField(form.signatoryName, true);
        checkField(form.signatoryTitle, true);
        checkField(form.signatoryEmail, true);
        break;
    }

    return { filled, required: required + optional, optional };
  };

  const progress = countFields();
  const progressPct = progress.required > 0 ? Math.round((progress.filled / progress.required) * 100) : 0;

  // --- Build validated data for submission ---
  const buildEntityData = (): InvestorEntityData | null => {
    const errs: Record<string, string> = {};

    const validateAddr = (
      addr: AddressState,
      prefix: string,
      isRequired: boolean
    ): AddressData | undefined => {
      if (!isRequired && !addr.street1) return undefined;
      if (isRequired && !addr.street1) {
        errs[`${prefix}.street1`] = "Street address is required";
      }
      if (isRequired && !addr.city) {
        errs[`${prefix}.city`] = "City is required";
      }
      if (isRequired && !addr.state) {
        errs[`${prefix}.state`] = "State is required";
      }
      if (isRequired && !addr.zip) {
        errs[`${prefix}.zip`] = "ZIP code is required";
      } else if (addr.zip && !/^\d{5}(-\d{4})?$/.test(addr.zip)) {
        errs[`${prefix}.zip`] = "Invalid ZIP code";
      }
      if (addr.street1 && PO_BOX_PATTERN.test(addr.street1)) {
        errs[`${prefix}.street1`] =
          "A physical street address is required for regulatory compliance.";
      }
      if (addr.street2 && PO_BOX_PATTERN.test(addr.street2)) {
        errs[`${prefix}.street2`] =
          "A physical street address is required for regulatory compliance.";
      }
      return {
        street1: addr.street1,
        street2: addr.street2 || undefined,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: addr.country || "US",
      };
    };

    let result: InvestorEntityData | null = null;

    switch (form.entityType) {
      case "INDIVIDUAL": {
        if (!form.firstName.trim()) errs.firstName = "First name is required";
        if (!form.lastName.trim()) errs.lastName = "Last name is required";
        const address = validateAddr(form.physicalAddress, "physicalAddress", true);
        result = {
          entityType: "INDIVIDUAL",
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          ssn: form.ssn || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          address: address!,
          useMailingAddress: form.useMailingAddress,
          mailingAddress: form.useMailingAddress
            ? validateAddr(form.mailingAddress, "mailingAddress", false)
            : undefined,
          phone: form.phone || undefined,
        };
        break;
      }
      case "LLC": {
        if (!form.llcName.trim()) errs.llcName = "LLC legal name is required";
        if (!form.signatoryName.trim()) errs.signatoryName = "Authorized signer name is required";
        if (!form.signatoryTitle.trim()) errs.signatoryTitle = "Signer title is required";
        if (!form.signatoryEmail.trim()) errs.signatoryEmail = "Signer email is required";
        const address = validateAddr(form.physicalAddress, "physicalAddress", true);
        result = {
          entityType: "LLC",
          legalName: form.llcName.trim(),
          ein: form.llcEin || undefined,
          stateOfFormation: form.llcStateOfFormation || undefined,
          dateOfFormation: form.llcDateOfFormation || undefined,
          countryOfFormation: form.llcCountryOfFormation || "US",
          taxClassification: (form.llcTaxClassification as "DISREGARDED_ENTITY" | "PARTNERSHIP" | "S_CORPORATION" | "C_CORPORATION") || undefined,
          address: address!,
          signatoryName: form.signatoryName.trim(),
          signatoryTitle: form.signatoryTitle.trim(),
          signatoryEmail: form.signatoryEmail.trim(),
          signatoryPhone: form.signatoryPhone || undefined,
          signatoryIsAccountHolder: form.signatoryIsAccountHolder,
        };
        break;
      }
      case "TRUST": {
        if (!form.trustName.trim()) errs.trustName = "Trust legal name is required";
        if (!form.trusteeName.trim()) errs.trusteeName = "Trustee name is required";
        if (!form.trusteeEmail.trim()) errs.trusteeEmail = "Trustee email is required";
        const address = validateAddr(form.physicalAddress, "physicalAddress", true);
        result = {
          entityType: "TRUST",
          legalName: form.trustName.trim(),
          trustType: (form.trustType as "REVOCABLE_LIVING" | "IRREVOCABLE" | "FAMILY" | "CHARITABLE" | "OTHER") || undefined,
          taxId: form.trustTaxId || undefined,
          dateEstablished: form.trustDateEstablished || undefined,
          governingState: form.trustGoverningState || undefined,
          address: address!,
          trusteeName: form.trusteeName.trim(),
          trusteeTitle: form.trusteeTitle || "Trustee",
          trusteeEmail: form.trusteeEmail.trim(),
          trusteePhone: form.trusteePhone || undefined,
        };
        break;
      }
      case "RETIREMENT": {
        if (!form.retAccountType) errs.retAccountType = "Account type is required";
        if (!form.retAccountTitle.trim()) errs.retAccountTitle = "Account title is required";
        if (!form.retCustodianName.trim()) errs.retCustodianName = "Custodian name is required";
        if (!form.retCustodianAccountNumber.trim()) errs.retCustodianAccountNumber = "Account number is required";
        if (!form.retAccountHolderName.trim()) errs.retAccountHolderName = "Account holder name is required";
        const custodianAddr = validateAddr(form.custodianAddress, "custodianAddress", false);
        result = {
          entityType: "RETIREMENT",
          accountType: form.retAccountType as "TRADITIONAL_IRA" | "ROTH_IRA" | "SOLO_401K" | "SEP_IRA" | "SIMPLE_IRA",
          accountTitle: form.retAccountTitle.trim(),
          custodianName: form.retCustodianName.trim(),
          custodianAccountNumber: form.retCustodianAccountNumber.trim(),
          custodianEin: form.retCustodianEin || undefined,
          custodianAddress: custodianAddr,
          custodianContactName: form.retCustodianContactName || undefined,
          custodianContactPhone: form.retCustodianContactPhone || undefined,
          custodianContactEmail: form.retCustodianContactEmail || undefined,
          accountHolderName: form.retAccountHolderName.trim(),
          accountHolderSsn: form.retAccountHolderSsn || undefined,
          accountHolderDob: form.retAccountHolderDob || undefined,
          accountHolderPhone: form.retAccountHolderPhone || undefined,
          accountHolderEmail: form.retAccountHolderEmail || undefined,
          custodianCoSignRequired: form.retCustodianCoSign,
        };
        break;
      }
      case "OTHER": {
        if (!form.otherEntityName.trim()) errs.otherEntityName = "Entity legal name is required";
        if (!form.signatoryName.trim()) errs.signatoryName = "Authorized signer name is required";
        if (!form.signatoryTitle.trim()) errs.signatoryTitle = "Signer title is required";
        if (!form.signatoryEmail.trim()) errs.signatoryEmail = "Signer email is required";
        const address = validateAddr(form.physicalAddress, "physicalAddress", true);
        result = {
          entityType: "OTHER",
          legalName: form.otherEntityName.trim(),
          otherEntityType: (form.otherEntityType as "CORPORATION" | "LIMITED_PARTNERSHIP" | "GENERAL_PARTNERSHIP" | "S_CORPORATION" | "NON_PROFIT" | "FOREIGN_ENTITY" | "OTHER") || undefined,
          ein: form.otherEin || undefined,
          stateOfFormation: form.otherStateOfFormation || undefined,
          countryOfFormation: form.otherCountryOfFormation || "US",
          dateOfFormation: form.otherDateOfFormation || undefined,
          taxClassification: (form.otherTaxClassification as "DISREGARDED_ENTITY" | "PARTNERSHIP" | "S_CORPORATION" | "C_CORPORATION") || undefined,
          address: address!,
          signatoryName: form.signatoryName.trim(),
          signatoryTitle: form.signatoryTitle.trim(),
          signatoryEmail: form.signatoryEmail.trim(),
          signatoryPhone: form.signatoryPhone || undefined,
        };
        break;
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return null;
    }

    setErrors({});
    return result;
  };

  const handleNext = () => {
    const data = buildEntityData();
    if (data) {
      onNext(data, form);
    }
  };

  // Update account title when account holder name changes (retirement)
  useEffect(() => {
    if (
      form.entityType === "RETIREMENT" &&
      form.retAccountHolderName &&
      !form.retAccountTitle
    ) {
      setForm((prev) => ({
        ...prev,
        retAccountTitle: `FBO ${prev.retAccountHolderName}`,
      }));
    }
  }, [form.retAccountHolderName, form.entityType, form.retAccountTitle]);

  // --- SSN/EIN show/hide callbacks for child components ---
  const ssnCallbacks = {
    showSsn,
    onToggleShowSsn: () => setShowSsn((v) => !v),
    onFocusSsn: () => setShowSsn(true),
    onBlurSsn: () => {
      setShowSsn(false);
      handleBlur("ssn");
    },
  };

  const einCallbacks = {
    showEin,
    onToggleShowEin: () => setShowEin((v) => !v),
    onFocusEin: () => setShowEin(true),
    onBlurEin: () => {
      setShowEin(false);
      // Determine which EIN field to blur based on entity type
      switch (form.entityType) {
        case "LLC":
          handleBlur("llcEin");
          break;
        case "TRUST":
          handleBlur("trustTaxId");
          break;
        case "RETIREMENT":
          handleBlur("retCustodianEin");
          break;
        case "OTHER":
          handleBlur("otherEin");
          break;
      }
    },
  };

  // Shared props passed to all entity form sub-components
  const sharedFormProps = {
    form,
    errors,
    addressErrors,
    updateField,
    updateAddress,
    handleBlur,
    handleAddressBlur,
  };

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {progress.filled} of {progress.required} fields completed
        </span>
        <span>{progressPct}%</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-1.5">
        <div
          className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Entity type selection cards */}
      <div>
        <Label className="text-gray-300 mb-3 block text-sm font-medium">
          How are you investing?
        </Label>
        <div className="grid gap-2">
          {ENTITY_CARDS.map((card) => {
            const Icon = card.icon;
            const isActive = form.entityType === card.type;
            return (
              <button
                key={card.type}
                type="button"
                onClick={() => updateField("entityType", card.type)}
                className={`w-full text-left p-3 min-h-[44px] rounded-lg border transition-colors flex items-center gap-3 ${
                  isActive
                    ? "border-[#0066FF] bg-[#0066FF]/10"
                    : "border-gray-600 bg-gray-700/30 hover:border-gray-500"
                }`}
              >
                <Icon
                  className={`h-5 w-5 flex-shrink-0 ${
                    isActive ? "text-[#0066FF]" : "text-gray-400"
                  }`}
                />
                <div>
                  <span className="text-white font-medium text-sm">
                    {card.label}
                  </span>
                  <p className="text-gray-400 text-xs">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic form based on entity type */}
      {form.entityType === "INDIVIDUAL" && (
        <IndividualForm
          {...sharedFormProps}
          {...ssnCallbacks}
        />
      )}

      {form.entityType === "LLC" && (
        <LLCForm
          {...sharedFormProps}
          {...einCallbacks}
        />
      )}

      {form.entityType === "TRUST" && (
        <TrustForm
          {...sharedFormProps}
          {...einCallbacks}
        />
      )}

      {form.entityType === "RETIREMENT" && (
        <RetirementForm
          {...sharedFormProps}
          {...ssnCallbacks}
          {...einCallbacks}
        />
      )}

      {form.entityType === "OTHER" && (
        <OtherEntityForm
          {...sharedFormProps}
          {...einCallbacks}
        />
      )}

      {/* Navigation buttons */}
      <div className="flex gap-2 pt-4 border-t border-gray-700">
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px] text-gray-400 hover:text-white"
          onClick={onBack}
          disabled={isLoading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
          onClick={handleNext}
          disabled={isLoading}
        >
          {isLoading ? "Saving..." : "Continue"}
          {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
