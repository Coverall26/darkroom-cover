"use client";

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Users,
  FileSignature,
  Shield,
  Building,
  DollarSign,
  Landmark,
  Info,
  Upload,
  ChevronDown,
  ChevronUp,
  Bell,
  BellRing,
} from "lucide-react";
import { useState } from "react";
import type { WizardData } from "../hooks/useWizardState";

const LP_STEPS = [
  { id: 1, label: "Account Creation", icon: Users, alwaysOn: true },
  { id: 2, label: "NDA E-Signature", icon: FileSignature, alwaysOn: false },
  { id: 3, label: "Accredited Investor", icon: Shield, alwaysOn: true },
  { id: 4, label: "Investor Type / Entity", icon: Building, alwaysOn: true },
  { id: 5, label: "Commitment + Signing", icon: DollarSign, alwaysOn: true },
  { id: 6, label: "Funding Instructions", icon: Landmark, alwaysOn: true },
];

const GP_FUND_DOCS = [
  { type: "NDA", label: "NDA / Confidentiality Agreement", hasDefault: true },
  { type: "SUB_AG", label: "Subscription Agreement", hasDefault: true },
  { type: "LPA", label: "Limited Partnership Agreement (LPA)", hasDefault: false },
  { type: "SIDE_LETTER", label: "Side Letter", hasDefault: false },
];

const STARTUP_DOCS = [
  { type: "NDA", label: "NDA / Confidentiality Agreement", hasDefault: true },
  { type: "SUB_AG", label: "SAFE / SPA Agreement", hasDefault: true },
  { type: "BOARD_CONSENT", label: "Board Consent", hasDefault: true },
];

interface Step7Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

export default function Step7LPOnboarding({ data, updateField }: Step7Props) {
  const docs = data.raiseMode === "STARTUP" ? STARTUP_DOCS : GP_FUND_DOCS;
  const is506c = data.regDExemption === "506C";
  const [gpNotifOpen, setGpNotifOpen] = useState(true);
  const [lpNotifOpen, setLpNotifOpen] = useState(true);

  const updateTemplateStatus = (
    type: string,
    status: "fundroom_template" | "custom_uploaded" | "not_set",
    customFileName?: string,
  ) => {
    const updated = data.documentTemplates.map((t) =>
      t.type === type ? { ...t, status, customFileName: customFileName || t.customFileName } : t,
    );
    // Add if not found
    if (!updated.find((t) => t.type === type)) {
      updated.push({ type, status, customFileName });
    }
    updateField("documentTemplates", updated);
  };

  const getTemplateStatus = (type: string) => {
    return data.documentTemplates.find((t) => t.type === type)?.status || "not_set";
  };

  const getTemplateFileName = (type: string) => {
    return data.documentTemplates.find((t) => t.type === type)?.customFileName;
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          LP Onboarding Settings
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure the investor onboarding experience.
        </p>
      </div>

      {/* Section 1: Onboarding Steps */}
      <div className="rounded-lg border dark:border-gray-700 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Onboarding Steps
        </h3>
        <div className="space-y-2">
          {LP_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className="flex items-center justify-between py-2 px-3 rounded-md bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-[#0066FF]/10 text-[#0066FF]">
                    <span className="text-xs font-bold">{step.id}</span>
                  </div>
                  <Icon size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {step.label}
                  </span>
                </div>
                {step.alwaysOn ? (
                  <span className="text-xs text-gray-400 font-medium">
                    Always on
                  </span>
                ) : (
                  <Switch defaultChecked />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Document Templates */}
      <div className="rounded-lg border dark:border-gray-700 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Document Templates
          </h3>
        </div>
        <div className="space-y-3">
          {docs.map((doc) => {
            const status = getTemplateStatus(doc.type);
            const customFile = getTemplateFileName(doc.type);

            return (
              <div
                key={doc.type}
                className="rounded-md border dark:border-gray-700 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSignature size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {doc.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === "fundroom_template" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                        FundRoom Template
                      </span>
                    )}
                    {status === "custom_uploaded" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                        Custom: {customFile || "Uploaded"}
                      </span>
                    )}
                    {status === "not_set" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                        Not Set
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {doc.hasDefault && status !== "fundroom_template" && (
                    <button
                      type="button"
                      className="text-xs text-[#0066FF] hover:underline"
                      onClick={() => updateTemplateStatus(doc.type, "fundroom_template")}
                    >
                      Use Default
                    </button>
                  )}
                  <label className="text-xs text-[#0066FF] hover:underline cursor-pointer flex items-center gap-1">
                    <Upload size={12} />
                    Upload Custom
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          updateTemplateStatus(doc.type, "custom_uploaded", file.name);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* External Document Settings */}
        <div className="border-t dark:border-gray-700 pt-4 mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allow LP External Upload
              </p>
              <p className="text-xs text-gray-500">
                LP uploads docs signed outside the platform.
              </p>
            </div>
            <Switch
              checked={data.allowExternalUpload}
              onCheckedChange={(v) => updateField("allowExternalUpload", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allow GP Upload for LP
              </p>
              <p className="text-xs text-gray-500">
                GP uploads signed docs for investors. Auto-confirmed.
              </p>
            </div>
            <Switch
              checked={data.allowGPUpload}
              onCheckedChange={(v) => updateField("allowGPUpload", v)}
            />
          </div>
        </div>
      </div>

      {/* Section 3: Accreditation Settings */}
      <div className="rounded-lg border dark:border-gray-700 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Accreditation & Compliance
        </h3>

        {/* Reg D Alert */}
        <div
          className={cn(
            "rounded-lg p-3",
            is506c
              ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
              : "bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
          )}
        >
          <div className="flex gap-2">
            <Info
              size={14}
              className={cn(
                "shrink-0 mt-0.5",
                is506c ? "text-amber-600" : "text-blue-600",
              )}
            />
            <p className="text-xs leading-relaxed">
              {is506c
                ? "506(c) offerings require verified accreditation. The minimum investment threshold method (per March 2025 guidance) is recommended for streamlined verification."
                : "506(b) offerings require self-certification. The GP must have a reasonable belief that investors are accredited."}
            </p>
          </div>
        </div>

        {/* Accreditation Method Selector */}
        <div className="space-y-3">
          <Label className="text-sm">Verification Method</Label>
          <div className="space-y-2">
            <label
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-all",
                data.accreditationMethod === "SELF_ACK"
                  ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                  : "dark:border-gray-700",
              )}
            >
              <input
                type="radio"
                name="accredMethod"
                value="SELF_ACK"
                checked={data.accreditationMethod === "SELF_ACK"}
                onChange={() => updateField("accreditationMethod", "SELF_ACK")}
                className="text-[#0066FF]"
              />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Self-Certification
                </p>
                <p className="text-xs text-gray-500">
                  {is506c
                    ? "Required but not sufficient alone for 506(c)."
                    : "Standard checkbox. Sufficient for 506(b)."}
                </p>
              </div>
            </label>

            <label
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-all",
                data.accreditationMethod === "SELF_ACK_MIN_INVEST"
                  ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                  : "dark:border-gray-700",
              )}
            >
              <input
                type="radio"
                name="accredMethod"
                value="SELF_ACK_MIN_INVEST"
                checked={data.accreditationMethod === "SELF_ACK_MIN_INVEST"}
                onChange={() => updateField("accreditationMethod", "SELF_ACK_MIN_INVEST")}
                className="text-[#0066FF]"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Minimum Threshold Method
                </p>
                <p className="text-xs text-gray-500">
                  $200K+ individuals / $1M+ entities per March 2025 guidance.
                </p>
              </div>
            </label>

            {data.accreditationMethod === "SELF_ACK_MIN_INVEST" && (
              <div className="ml-8 mt-2">
                <Label className="text-xs text-gray-500">
                  Minimum Investment Threshold
                </Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                  <Input
                    type="text"
                    placeholder="200,000"
                    value={data.minimumInvestThreshold}
                    onChange={(e) =>
                      updateField("minimumInvestThreshold", e.target.value)
                    }
                    className="pl-7 text-base sm:text-sm"
                  />
                </div>
              </div>
            )}

            <label
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 cursor-not-allowed opacity-50",
                "dark:border-gray-700",
              )}
            >
              <input
                type="radio"
                name="accredMethod"
                disabled
                className="text-gray-400"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Persona KYC
                  </p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    Coming Soon
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Automated ID verification + sanctions screening.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* GP Approval Toggle */}
        <div className="border-t dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Require GP Approval
              </p>
              <p className="text-xs text-gray-500">
                LP submissions go to approval queue before completing onboarding.
              </p>
            </div>
            <Switch
              checked={data.gpApproval}
              onCheckedChange={(v) => updateField("gpApproval", v)}
            />
          </div>
        </div>
      </div>

      {/* Section 4: Notification Preferences */}
      <div className="rounded-lg border dark:border-gray-700 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Notification Preferences
        </h3>

        {/* GP Notifications */}
        <div className="rounded-md border dark:border-gray-700">
          <button
            type="button"
            onClick={() => setGpNotifOpen(!gpNotifOpen)}
            className="flex items-center justify-between w-full px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-2">
              <BellRing size={14} className="text-[#0066FF]" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                GP Notifications
              </span>
              <span className="text-[10px] text-gray-400">
                (sent to fund managers)
              </span>
            </div>
            {gpNotifOpen ? (
              <ChevronUp size={14} className="text-gray-400" />
            ) : (
              <ChevronDown size={14} className="text-gray-400" />
            )}
          </button>
          {gpNotifOpen && (
            <div className="px-3 pb-3 space-y-3 border-t dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  LP starts onboarding
                </p>
                <Switch
                  checked={data.notifyGpLpOnboardingStart}
                  onCheckedChange={(v) => updateField("notifyGpLpOnboardingStart", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New commitment received
                </p>
                <Switch
                  checked={data.emailGPCommitment}
                  onCheckedChange={(v) => updateField("emailGPCommitment", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Wire proof uploaded
                </p>
                <Switch
                  checked={data.emailGPWire}
                  onCheckedChange={(v) => updateField("emailGPWire", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  External document uploaded
                </p>
                <Switch
                  checked={data.notifyGpExternalDocUpload}
                  onCheckedChange={(v) => updateField("notifyGpExternalDocUpload", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  LP inactive for 72 hours
                </p>
                <Switch
                  checked={data.notifyGpLpInactive}
                  onCheckedChange={(v) => updateField("notifyGpLpInactive", v)}
                />
              </div>
            </div>
          )}
        </div>

        {/* LP Notifications */}
        <div className="rounded-md border dark:border-gray-700">
          <button
            type="button"
            onClick={() => setLpNotifOpen(!lpNotifOpen)}
            className="flex items-center justify-between w-full px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-emerald-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                LP Notifications
              </span>
              <span className="text-[10px] text-gray-400">
                (sent to investors)
              </span>
            </div>
            {lpNotifOpen ? (
              <ChevronUp size={14} className="text-gray-400" />
            ) : (
              <ChevronDown size={14} className="text-gray-400" />
            )}
          </button>
          {lpNotifOpen && (
            <div className="px-3 pb-3 space-y-3 border-t dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Step completion emails
                </p>
                <Switch
                  checked={data.emailLPSteps}
                  onCheckedChange={(v) => updateField("emailLPSteps", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Wire confirmation received
                </p>
                <Switch
                  checked={data.notifyLpWireConfirm}
                  onCheckedChange={(v) => updateField("notifyLpWireConfirm", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New document available
                </p>
                <Switch
                  checked={data.notifyLpNewDocument}
                  onCheckedChange={(v) => updateField("notifyLpNewDocument", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Change request from GP
                </p>
                <Switch
                  checked={data.notifyLpChangeRequest}
                  onCheckedChange={(v) => updateField("notifyLpChangeRequest", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Onboarding reminder (48hr)
                </p>
                <Switch
                  checked={data.notifyLpOnboardingReminder}
                  onCheckedChange={(v) => updateField("notifyLpOnboardingReminder", v)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
