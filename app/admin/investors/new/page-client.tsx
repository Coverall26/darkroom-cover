"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  User,
  Building2,
  DollarSign,
  FileText,
  ClipboardCheck,
  Loader2,
  PlusCircle,
  Trash2,
  EyeIcon,
  AlertCircleIcon,
  Upload,
} from "lucide-react";
import { EncryptionBadge } from "@/components/ui/encryption-badge";

/**
 * Manual Investor Entry Wizard (5 Steps)
 *
 * Step 1: Basic Info — First/Last Name, Email, Phone, Lead Source
 * Step 2: Investor Details — Entity architecture + accreditation
 * Step 3: Commitment — Fund, amount, date, funding status, payments
 * Step 4: Documents — Upload signed docs per type with date-signed
 * Step 5: Review & Save — Summary + vault access option
 */

const STEPS = [
  { id: 1, label: "Basic Info", icon: User },
  { id: 2, label: "Investor Details", icon: Building2 },
  { id: 3, label: "Commitment", icon: DollarSign },
  { id: 4, label: "Documents", icon: FileText },
  { id: 5, label: "Review & Save", icon: ClipboardCheck },
] as const;

const ENTITY_TYPES = [
  { value: "INDIVIDUAL", label: "Individual" },
  { value: "LLC", label: "LLC" },
  { value: "TRUST", label: "Trust" },
  { value: "RETIREMENT", label: "401k / IRA" },
  { value: "OTHER", label: "Other Entity" },
] as const;

const LEAD_SOURCES = [
  { value: "DIRECT", label: "Direct Relationship" },
  { value: "REFERRAL", label: "Referral" },
  { value: "EVENT", label: "Event" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "DATAROOM", label: "Dataroom Viewer" },
  { value: "OTHER", label: "Other" },
] as const;

const PAYMENT_METHODS = [
  { value: "wire", label: "Wire Transfer" },
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH" },
  { value: "other", label: "Other" },
] as const;

const DOCUMENT_TYPES = [
  { value: "NDA", label: "Non-Disclosure Agreement" },
  { value: "SUBSCRIPTION_AGREEMENT", label: "Subscription Agreement" },
  { value: "LPA", label: "LPA / SAFE" },
  { value: "SIDE_LETTER", label: "Side Letter" },
  { value: "ACCREDITATION_PROOF", label: "Accreditation Letter" },
  { value: "FORMATION_DOCS", label: "Formation Documents" },
  { value: "K1_TAX_FORM", label: "Tax Form (W-9/W-8BEN)" },
  { value: "OTHER", label: "Other Document" },
] as const;

interface PaymentRecord {
  amount: string;
  dateReceived: string;
  method: string;
  bankReference: string;
  notes: string;
}

interface LeadMatch {
  email: string;
  viewedAt: string;
  linkId: string;
  documentName: string;
  source: string;
}

interface InvestorFormData {
  // Step 1
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  leadSource: string;
  // Step 2
  entityType: string;
  entityName: string;
  taxId: string;
  address: string;
  accreditationStatus: string;
  accreditationType: string;
  accreditationVerifierName: string;
  accreditationDate: string;
  minimumInvestmentThreshold: string;
  // Step 3
  fundId: string;
  commitmentAmount: string;
  commitmentDate: string;
  specialTerms: string;
  fundingStatus: string;
  payments: PaymentRecord[];
  // Step 4
  documents: Array<{
    type: string;
    name: string;
    file: File | null;
    dateSigned: string;
  }>;
  // Step 5
  sendVaultAccess: boolean;
  notes: string;
}

const initialFormData: InvestorFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  leadSource: "",
  entityType: "INDIVIDUAL",
  entityName: "",
  taxId: "",
  address: "",
  accreditationStatus: "SELF_CERTIFIED",
  accreditationType: "",
  accreditationVerifierName: "",
  accreditationDate: new Date().toISOString().split("T")[0],
  minimumInvestmentThreshold: "",
  fundId: "",
  commitmentAmount: "",
  commitmentDate: new Date().toISOString().split("T")[0],
  specialTerms: "",
  fundingStatus: "COMMITTED",
  payments: [],
  documents: [],
  sendVaultAccess: true,
  notes: "",
};

export default function ManualInvestorWizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<InvestorFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [funds, setFunds] = useState<
    Array<{ id: string; name: string; targetSize?: number }>
  >([]);
  const [leadMatch, setLeadMatch] = useState<LeadMatch | null>(null);
  const [checkingLead, setCheckingLead] = useState(false);

  useEffect(() => {
    fetch("/api/fund-settings/funds")
      .then((res) => res.json())
      .then((data) => setFunds(data.funds || []))
      .catch((e) => console.error("Failed to load funds:", e));
  }, []);

  // Lead matching: check if email exists as a dataroom viewer
  const checkLeadMatch = async (email: string) => {
    if (!z.string().email().safeParse(email).success) return;
    setCheckingLead(true);
    try {
      const res = await fetch(
        `/api/admin/investors/check-lead?email=${encodeURIComponent(email)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.match) {
          setLeadMatch(data.match);
          if (!formData.leadSource) {
            updateField("leadSource", "DATAROOM");
          }
        } else {
          setLeadMatch(null);
        }
      }
    } catch {
      // Silently fail — lead matching is non-critical
    } finally {
      setCheckingLead(false);
    }
  };

  const updateField = <K extends keyof InvestorFormData>(
    field: K,
    value: InvestorFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = useCallback((): boolean => {
    switch (step) {
      case 1:
        return (
          formData.firstName.length >= 1 &&
          formData.lastName.length >= 1 &&
          z.string().email().safeParse(formData.email).success
        );
      case 2:
        return formData.entityType.length > 0;
      case 3:
        return (
          formData.fundId.length > 0 &&
          Number(formData.commitmentAmount) > 0
        );
      case 4:
        return true; // Documents are optional for manual entry
      case 5:
        return true;
      default:
        return false;
    }
  }, [step, formData]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Convert document files to base64 for JSON submission
      const docsWithData = await Promise.all(
        formData.documents.map(async (doc) => {
          if (!doc.file) return null;
          const buffer = await doc.file.arrayBuffer();
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(buffer)),
          );
          return {
            type: doc.type,
            filename: doc.name,
            dateSigned: doc.dateSigned,
            fileData: base64,
            mimeType: doc.file.type,
            fileSize: doc.file.size,
          };
        }),
      );

      const res = await fetch("/api/admin/investors/manual-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          leadSource: formData.leadSource || undefined,
          entityType: formData.entityType,
          entityName: formData.entityName || undefined,
          taxId: formData.taxId || undefined,
          address: formData.address || undefined,
          accreditationStatus: formData.accreditationStatus,
          accreditationType: formData.accreditationType || undefined,
          accreditationVerifierName:
            formData.accreditationVerifierName || undefined,
          accreditationDate: formData.accreditationDate || undefined,
          minimumInvestmentThreshold: formData.minimumInvestmentThreshold
            ? Number(formData.minimumInvestmentThreshold)
            : undefined,
          fundId: formData.fundId,
          commitmentAmount: Number(formData.commitmentAmount),
          commitmentDate: formData.commitmentDate,
          specialTerms: formData.specialTerms || undefined,
          fundingStatus:
            formData.fundingStatus === "INSTALLMENTS"
              ? "PARTIALLY_FUNDED"
              : formData.fundingStatus,
          payments: formData.payments.filter((p) => p.amount),
          sendVaultAccess: formData.sendVaultAccess,
          notes: formData.notes || undefined,
          documents: docsWithData.filter(Boolean),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success("Investor added successfully");
        router.push(`/admin/investors/${data.investorId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to add investor");
      }
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fullName = `${formData.firstName} ${formData.lastName}`.trim();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/investors">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Investor Manually</h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of 5 — {STEPS[step - 1].label}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isComplete = s.id < step;
          return (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => s.id < step && setStep(s.id)}
                disabled={s.id > step}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isComplete
                      ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden md:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-1 h-px w-8 ${
                    isComplete ? "bg-blue-400" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Smith"
                    value={formData.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    onBlur={(e) => checkLeadMatch(e.target.value)}
                  />
                  {checkingLead && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking for dataroom activity...
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="+1 (555) 123-4567"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>
              </div>

              {/* Lead match banner */}
              {leadMatch && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-start gap-3">
                  <EyeIcon className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900">
                      {leadMatch.source === "waitlist"
                        ? "Marketplace Waitlist Match"
                        : "Dataroom Viewer Found"}
                    </p>
                    <p className="text-xs text-green-700 mt-0.5">
                      {leadMatch.source === "waitlist"
                        ? `This person joined the marketplace waitlist on ${new Date(leadMatch.viewedAt).toLocaleDateString()}.`
                        : `This person viewed "${leadMatch.documentName}" on ${new Date(leadMatch.viewedAt).toLocaleDateString()}.`}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 min-h-[36px] text-green-700 border-green-300"
                      onClick={() => {
                        updateField(
                          "leadSource",
                          leadMatch.source === "waitlist"
                            ? "OTHER"
                            : "DATAROOM",
                        );
                        toast.success("Engagement data imported");
                      }}
                    >
                      Import engagement data
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Lead Source</Label>
                <Select
                  value={formData.leadSource}
                  onValueChange={(v) => updateField("leadSource", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="How did they find you?" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Entity Type *</Label>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {ENTITY_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => updateField("entityType", type.value)}
                      className={`rounded-lg border p-3 text-center text-sm transition-colors ${
                        formData.entityType === type.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              {formData.entityType !== "INDIVIDUAL" && (
                <div className="space-y-2">
                  <Label htmlFor="entityName">Entity Legal Name</Label>
                  <Input
                    id="entityName"
                    placeholder="Entity legal name"
                    value={formData.entityName}
                    onChange={(e) => updateField("entityName", e.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="taxId" className="flex items-center gap-2">
                    Tax ID (SSN/EIN) <EncryptionBadge variant="compact" />
                  </Label>
                  <Input
                    id="taxId"
                    placeholder="XXX-XX-XXXX or XX-XXXXXXX"
                    value={formData.taxId}
                    onChange={(e) => updateField("taxId", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Will be encrypted with AES-256
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Accreditation Recording</Label>
                  <Select
                    value={formData.accreditationStatus}
                    onValueChange={(v) =>
                      updateField("accreditationStatus", v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SELF_CERTIFIED">
                        Self-Acknowledged
                      </SelectItem>
                      <SelectItem value="KYC_VERIFIED">
                        Verified by Third Party
                      </SelectItem>
                      <SelectItem value="MIN_INVESTMENT">
                        Minimum Investment Threshold Met
                      </SelectItem>
                      <SelectItem value="PENDING">
                        Not Yet Confirmed
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {formData.accreditationStatus === "SELF_CERTIFIED" && (
                <div className="space-y-2">
                  <Label htmlFor="accreditationDate">Date Acknowledged</Label>
                  <Input
                    id="accreditationDate"
                    type="date"
                    value={formData.accreditationDate}
                    onChange={(e) =>
                      updateField("accreditationDate", e.target.value)
                    }
                  />
                </div>
              )}
              {formData.accreditationStatus === "KYC_VERIFIED" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="accreditationDate">
                      Verification Date
                    </Label>
                    <Input
                      id="accreditationDate"
                      type="date"
                      value={formData.accreditationDate}
                      onChange={(e) =>
                        updateField("accreditationDate", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="verifierName">Verifier Name</Label>
                    <Input
                      id="verifierName"
                      placeholder="e.g. VerifyInvestor, LLC"
                      value={formData.accreditationVerifierName}
                      onChange={(e) =>
                        updateField(
                          "accreditationVerifierName",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
              )}
              {formData.accreditationStatus === "MIN_INVESTMENT" && (
                <div className="space-y-2">
                  <Label htmlFor="minThreshold">
                    Minimum Investment Amount (USD)
                  </Label>
                  <Input
                    id="minThreshold"
                    type="number"
                    min="0"
                    placeholder="250000"
                    value={formData.minimumInvestmentThreshold}
                    onChange={(e) =>
                      updateField(
                        "minimumInvestmentThreshold",
                        e.target.value,
                      )
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  placeholder="Street address, City, State, ZIP"
                  value={formData.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Fund *</Label>
                <Select
                  value={formData.fundId}
                  onValueChange={(v) => updateField("fundId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a fund" />
                  </SelectTrigger>
                  <SelectContent>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="commitmentAmount">
                    Commitment Amount (USD) *
                  </Label>
                  <Input
                    id="commitmentAmount"
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="100000"
                    value={formData.commitmentAmount}
                    onChange={(e) =>
                      updateField("commitmentAmount", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commitmentDate">Commitment Date</Label>
                  <Input
                    id="commitmentDate"
                    type="date"
                    value={formData.commitmentDate}
                    onChange={(e) =>
                      updateField("commitmentDate", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Funding Status</Label>
                <Select
                  value={formData.fundingStatus}
                  onValueChange={(v) => {
                    updateField("fundingStatus", v);
                    // Init payment records for installments
                    if (
                      v === "INSTALLMENTS" &&
                      formData.payments.length === 0
                    ) {
                      updateField("payments", [
                        {
                          amount: "",
                          dateReceived: "",
                          method: "wire",
                          bankReference: "",
                          notes: "",
                        },
                      ]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMMITTED">Not Yet Funded</SelectItem>
                    <SelectItem value="PARTIALLY_FUNDED">
                      Partially Funded
                    </SelectItem>
                    <SelectItem value="FUNDED">Fully Funded</SelectItem>
                    <SelectItem value="INSTALLMENTS">
                      Installments (multiple payments)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment details for funded/partial */}
              {(formData.fundingStatus === "FUNDED" ||
                formData.fundingStatus === "PARTIALLY_FUNDED") && (
                <div className="rounded-lg border p-4 space-y-3 bg-gray-50">
                  <h4 className="text-sm font-semibold">Payment Details</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Amount Received</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="Amount received"
                        value={formData.payments[0]?.amount || ""}
                        onChange={(e) => {
                          const p = [...formData.payments];
                          if (!p[0])
                            p[0] = {
                              amount: "",
                              dateReceived: "",
                              method: "wire",
                              bankReference: "",
                              notes: "",
                            };
                          p[0] = { ...p[0], amount: e.target.value };
                          updateField("payments", p);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date Received</Label>
                      <Input
                        type="date"
                        value={formData.payments[0]?.dateReceived || ""}
                        onChange={(e) => {
                          const p = [...formData.payments];
                          if (!p[0])
                            p[0] = {
                              amount: "",
                              dateReceived: "",
                              method: "wire",
                              bankReference: "",
                              notes: "",
                            };
                          p[0] = { ...p[0], dateReceived: e.target.value };
                          updateField("payments", p);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Payment Method</Label>
                      <Select
                        value={formData.payments[0]?.method || "wire"}
                        onValueChange={(v) => {
                          const p = [...formData.payments];
                          if (!p[0])
                            p[0] = {
                              amount: "",
                              dateReceived: "",
                              method: "wire",
                              bankReference: "",
                              notes: "",
                            };
                          p[0] = { ...p[0], method: v };
                          updateField("payments", p);
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bank Reference</Label>
                      <Input
                        placeholder="Wire reference #"
                        value={formData.payments[0]?.bankReference || ""}
                        onChange={(e) => {
                          const p = [...formData.payments];
                          if (!p[0])
                            p[0] = {
                              amount: "",
                              dateReceived: "",
                              method: "wire",
                              bankReference: "",
                              notes: "",
                            };
                          p[0] = { ...p[0], bankReference: e.target.value };
                          updateField("payments", p);
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      placeholder="Optional notes"
                      value={formData.payments[0]?.notes || ""}
                      onChange={(e) => {
                        const p = [...formData.payments];
                        if (!p[0])
                          p[0] = {
                            amount: "",
                            dateReceived: "",
                            method: "wire",
                            bankReference: "",
                            notes: "",
                          };
                        p[0] = { ...p[0], notes: e.target.value };
                        updateField("payments", p);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Installment payments */}
              {formData.fundingStatus === "INSTALLMENTS" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      Installment Payments
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateField("payments", [
                          ...formData.payments,
                          {
                            amount: "",
                            dateReceived: "",
                            method: "wire",
                            bankReference: "",
                            notes: "",
                          },
                        ])
                      }
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Add Payment
                    </Button>
                  </div>
                  {formData.payments.map((payment, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border p-3 space-y-2 bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">
                          Payment {idx + 1}
                        </span>
                        {formData.payments.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateField(
                                "payments",
                                formData.payments.filter((_, i) => i !== idx),
                              )
                            }
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Amount *</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="50000"
                            value={payment.amount}
                            onChange={(e) => {
                              const p = [...formData.payments];
                              p[idx] = { ...p[idx], amount: e.target.value };
                              updateField("payments", p);
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Date Received *</Label>
                          <Input
                            type="date"
                            value={payment.dateReceived}
                            onChange={(e) => {
                              const p = [...formData.payments];
                              p[idx] = {
                                ...p[idx],
                                dateReceived: e.target.value,
                              };
                              updateField("payments", p);
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Method</Label>
                          <Select
                            value={payment.method || "wire"}
                            onValueChange={(v) => {
                              const p = [...formData.payments];
                              p[idx] = { ...p[idx], method: v };
                              updateField("payments", p);
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Bank Reference</Label>
                          <Input
                            placeholder="Wire ref #"
                            value={payment.bankReference}
                            onChange={(e) => {
                              const p = [...formData.payments];
                              p[idx] = {
                                ...p[idx],
                                bankReference: e.target.value,
                              };
                              updateField("payments", p);
                            }}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2 lg:col-span-2">
                          <Label className="text-xs">Notes</Label>
                          <Input
                            placeholder="Optional notes"
                            value={payment.notes}
                            onChange={(e) => {
                              const p = [...formData.payments];
                              p[idx] = { ...p[idx], notes: e.target.value };
                              updateField("payments", p);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {formData.payments.length > 0 && (
                    <div className="text-sm text-gray-600 flex items-center gap-1">
                      <AlertCircleIcon className="h-4 w-4" />
                      Total funded: $
                      {formData.payments
                        .reduce(
                          (sum, p) => sum + (Number(p.amount) || 0),
                          0,
                        )
                        .toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="specialTerms">
                  Special Terms / Side Letter Notes
                </Label>
                <Textarea
                  id="specialTerms"
                  placeholder="Any special terms or side letter provisions..."
                  value={formData.specialTerms}
                  onChange={(e) => updateField("specialTerms", e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload signed documents on behalf of this investor. These will
                appear in their document vault as GP-confirmed. You can skip
                any document and upload later.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {DOCUMENT_TYPES.map((docType) => {
                  const attached = formData.documents.find(
                    (d) => d.type === docType.value,
                  );
                  return (
                    <div
                      key={docType.value}
                      className={`rounded-lg border p-4 ${
                        attached
                          ? "border-green-300 bg-green-50"
                          : "border-dashed border-gray-300"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          {attached ? (
                            <Upload className="mb-2 h-5 w-5 text-green-600" />
                          ) : (
                            <FileText className="mb-2 h-5 w-5 text-gray-400" />
                          )}
                          <p className="text-sm font-medium">
                            {docType.label}
                          </p>
                        </div>
                        {attached && (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-700"
                          >
                            Attached
                          </Badge>
                        )}
                      </div>
                      {!attached && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Drag & drop or click to upload
                        </p>
                      )}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="mt-2 w-full text-xs"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (file) {
                            updateField("documents", [
                              ...formData.documents.filter(
                                (d) => d.type !== docType.value,
                              ),
                              {
                                type: docType.value,
                                name: file.name,
                                file,
                                dateSigned: new Date()
                                  .toISOString()
                                  .split("T")[0],
                              },
                            ]);
                          }
                        }}
                      />
                      {attached && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-gray-600 truncate">
                            {attached.name}
                          </p>
                          <div className="space-y-1">
                            <Label className="text-xs">Date Signed</Label>
                            <Input
                              type="date"
                              className="text-xs h-8"
                              value={attached.dateSigned || ""}
                              onChange={(e) => {
                                const docs = formData.documents.map((d) =>
                                  d.type === docType.value
                                    ? { ...d, dateSigned: e.target.value }
                                    : d,
                                );
                                updateField("documents", docs);
                              }}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 h-7 px-2 text-xs"
                            onClick={() => {
                              updateField(
                                "documents",
                                formData.documents.filter(
                                  (d) => d.type !== docType.value,
                                ),
                              );
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-lg font-semibold">Review Summary</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Investor
                    </p>
                    <p className="font-medium">{fullName}</p>
                    <p className="text-sm">{formData.email}</p>
                    {formData.phone && (
                      <p className="text-sm">{formData.phone}</p>
                    )}
                    {formData.leadSource && (
                      <p className="text-sm text-muted-foreground">
                        Source:{" "}
                        {LEAD_SOURCES.find(
                          (s) => s.value === formData.leadSource,
                        )?.label || formData.leadSource}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Entity
                    </p>
                    <p>
                      <Badge variant="outline">{formData.entityType}</Badge>
                    </p>
                    {formData.entityName && <p>{formData.entityName}</p>}
                    <p className="text-sm text-muted-foreground">
                      Accreditation:{" "}
                      {formData.accreditationStatus === "SELF_CERTIFIED"
                        ? "Self-Acknowledged"
                        : formData.accreditationStatus === "KYC_VERIFIED"
                          ? "Third-Party Verified"
                          : formData.accreditationStatus === "MIN_INVESTMENT"
                            ? "Min Investment Met"
                            : "Not Confirmed"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Commitment
                    </p>
                    <p className="text-lg font-bold">
                      $
                      {Number(formData.commitmentAmount).toLocaleString()}
                    </p>
                    <p className="text-sm">
                      Fund:{" "}
                      {funds.find((f) => f.id === formData.fundId)?.name ||
                        "—"}
                    </p>
                    <p className="text-sm">
                      Status:{" "}
                      <Badge variant="outline">
                        {formData.fundingStatus === "COMMITTED"
                          ? "Not Yet Funded"
                          : formData.fundingStatus === "FUNDED"
                            ? "Fully Funded"
                            : formData.fundingStatus === "INSTALLMENTS"
                              ? "Installments"
                              : "Partially Funded"}
                      </Badge>
                    </p>
                    {formData.payments.length > 0 &&
                      formData.fundingStatus !== "COMMITTED" && (
                        <p className="text-sm">
                          Total funded: $
                          {formData.payments
                            .reduce(
                              (sum, p) => sum + (Number(p.amount) || 0),
                              0,
                            )
                            .toLocaleString()}
                        </p>
                      )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Documents
                    </p>
                    {formData.documents.length > 0 ? (
                      <ul className="space-y-1">
                        {formData.documents.map((d) => (
                          <li key={d.type} className="text-sm flex gap-2">
                            <Badge
                              variant="secondary"
                              className="text-xs bg-green-100 text-green-700"
                            >
                              {DOCUMENT_TYPES.find(
                                (dt) => dt.value === d.type,
                              )?.label || d.type}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No documents attached
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sendVaultAccess}
                    onChange={(e) =>
                      updateField("sendVaultAccess", e.target.checked)
                    }
                    className="rounded mt-0.5 h-4 w-4"
                  />
                  <div>
                    <span className="text-sm font-medium">
                      Send invitation email to investor
                    </span>
                    <p className="text-xs text-muted-foreground">
                      LP gets email with link to create account and access
                      their vault. Recommended.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="vaultAccess"
                    checked={!formData.sendVaultAccess}
                    onChange={() => updateField("sendVaultAccess", false)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <div>
                    <span className="text-sm font-medium">
                      Save internally only
                    </span>
                    <p className="text-xs text-muted-foreground">
                      No email sent. Investor exists in system but does not
                      have platform access.
                    </p>
                  </div>
                </label>
                <div className="space-y-2">
                  <Label htmlFor="notes">Internal Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any internal notes about this investor..."
                    value={formData.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 1}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>

        {step < 5 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Add Investor
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
