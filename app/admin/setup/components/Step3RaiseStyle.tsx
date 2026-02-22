"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Zap,
  FolderLock,
  Shield,
  Info,
  AlertTriangle,
  Check,
  FileCheck,
  Scale,
} from "lucide-react";
import type { WizardData } from "../hooks/useWizardState";

const MODES = [
  {
    value: "GP_FUND" as const,
    label: "GP / LP Fund",
    icon: Briefcase,
    description:
      "Raise commitments from LPs via Limited Partnership Agreement. Issue capital calls, manage distributions, generate K-1s.",
    badges: ["PE", "VC", "Real Estate", "Hedge Funds"],
    gradient: "from-blue-600 to-blue-700",
  },
  {
    value: "STARTUP" as const,
    label: "Startup capital raise",
    icon: Zap,
    description:
      "Raise equity via SAFE, convertible notes, or priced rounds. Track cap table, manage SPAs.",
    badges: ["Pre-seed", "Seed", "Series A", "SPV"],
    gradient: "from-emerald-600 to-emerald-700",
  },
  {
    value: "DATAROOM_ONLY" as const,
    label: "Just a dataroom",
    icon: FolderLock,
    description:
      "Start with a secure dataroom. Set up fund/raise later when ready.",
    badges: ["Free tier"],
    gradient: "from-gray-500 to-gray-600",
  },
];

interface Step3Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

export default function Step3RaiseStyle({ data, updateField }: Step3Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          What Kind of Raise?
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          This selection drives your entire platform experience.
        </p>
      </div>

      {/* Mode Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const isSelected = data.raiseMode === mode.value;
          return (
            <button
              key={mode.value}
              onClick={() => updateField("raiseMode", mode.value)}
              className={cn(
                "relative flex flex-col items-start p-5 rounded-xl border-2 text-left transition-all",
                isSelected
                  ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/20"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600",
              )}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[#0066FF] flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
              <div
                className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center bg-gradient-to-br text-white mb-3",
                  mode.gradient,
                )}
              >
                <Icon size={20} />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                {mode.label}
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                {mode.description}
              </p>
              <div className="flex flex-wrap gap-1 mt-3">
                {mode.badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Regulation D Exemption (shown if not DATAROOM_ONLY) */}
      {data.raiseMode && data.raiseMode !== "DATAROOM_ONLY" && (
        <div className="space-y-4 border-t pt-6">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              SEC Regulation D Exemption
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Choose the exemption that applies to your offering.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* 506(b) Card */}
            <button
              onClick={() => updateField("regDExemption", "506B")}
              className={cn(
                "flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                data.regDExemption === "506B"
                  ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} className="text-[#0066FF]" />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  Rule 506(b) — Private Offering
                </span>
                {data.regDExemption === "506B" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                    RECOMMENDED
                  </span>
                )}
              </div>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> Simpler
                  accreditation (self-certification)
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> Up to 35
                  non-accredited sophisticated investors
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" />{" "}
                  Pre-existing relationship required
                </li>
              </ul>
            </button>

            {/* 506(c) Card */}
            <button
              onClick={() => updateField("regDExemption", "506C")}
              className={cn(
                "flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                data.regDExemption === "506C"
                  ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} className="text-amber-500" />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  Rule 506(c) — General Solicitation
                </span>
              </div>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> Public
                  advertising permitted
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> FundRoom
                  Marketplace eligible
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> ALL
                  investors must be accredited
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> Must
                  verify accreditation
                </li>
              </ul>
            </button>

            {/* Regulation A+ Card */}
            <button
              onClick={() => updateField("regDExemption", "REG_A_PLUS")}
              className={cn(
                "flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                data.regDExemption === "REG_A_PLUS"
                  ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Scale size={16} className="text-purple-500" />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  Regulation A+ — Mini-IPO
                </span>
              </div>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> Non-accredited
                  investors allowed
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> Tier 1: up to
                  $20M / Tier 2: up to $75M
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> SEC
                  qualification required
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> Tier 2:
                  audited financials required
                </li>
              </ul>
            </button>

            {/* Rule 504 Card */}
            <button
              onClick={() => updateField("regDExemption", "RULE_504")}
              className={cn(
                "flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                data.regDExemption === "RULE_504"
                  ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <FileCheck size={16} className="text-teal-500" />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  Rule 504 — Small Offering
                </span>
              </div>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> Up to $10M in
                  a 12-month period
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={12} className="text-emerald-500" /> Non-accredited
                  investors allowed
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> State
                  registration may be required
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> Not
                  available to reporting companies
                </li>
              </ul>
            </button>
          </div>

          {/* Exemption Info Alerts */}
          {data.regDExemption === "506C" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:bg-blue-950/30 dark:border-blue-800">
              <div className="flex gap-3">
                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                  <strong>March 2025 SEC Guidance:</strong> Setting your minimum
                  investment at $200,000+ (individuals) or $1,000,000+ (entities)
                  combined with written investor representation satisfies 506(c)
                  verification requirements without income/net worth documentation.
                </div>
              </div>
            </div>
          )}

          {data.regDExemption === "REG_A_PLUS" && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:bg-purple-950/30 dark:border-purple-800">
              <div className="flex gap-3">
                <Info size={16} className="text-purple-600 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
                  <strong>Regulation A+:</strong> Requires SEC qualification (Form 1-A filing).
                  Tier 1 offerings (up to $20M) are subject to state Blue Sky review.
                  Tier 2 offerings (up to $75M) require audited financial statements and
                  ongoing reporting (Form 1-K annual, Form 1-SA semi-annual).
                  Non-accredited investors in Tier 2 are limited to 10% of income or net worth.
                </div>
              </div>
            </div>
          )}

          {data.regDExemption === "RULE_504" && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:bg-teal-950/30 dark:border-teal-800">
              <div className="flex gap-3">
                <Info size={16} className="text-teal-600 shrink-0 mt-0.5" />
                <div className="text-xs text-teal-800 dark:text-teal-300 leading-relaxed">
                  <strong>Rule 504:</strong> Allows raises up to $10M in a 12-month period.
                  State securities registration may be required in each state where you
                  sell securities. Generally available only to non-reporting companies.
                  Securities may be restricted (no public resale) unless registered at the state level.
                </div>
              </div>
            </div>
          )}

          {/* Minimum Investment */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Minimum Investment <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  $
                </span>
                <Input
                  type="text"
                  placeholder="200,000"
                  value={data.minInvestment}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    const formatted = raw
                      ? Number(raw).toLocaleString("en-US")
                      : "";
                    updateField("minInvestment", formatted);
                  }}
                  className="pl-7 text-base sm:text-sm"
                />
              </div>
              {data.regDExemption === "506C" && (
                <p className="text-xs text-blue-600">
                  506(c): $200K+ simplifies accreditation per SEC March 2025
                  guidance
                </p>
              )}
            </div>
            {data.raiseMode === "GP_FUND" && (
              <div className="space-y-1.5">
                <Label>Unit/Share Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                  <Input
                    type="text"
                    placeholder="1,000"
                    value={data.sharePrice}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      const formatted = raw
                        ? Number(raw).toLocaleString("en-US")
                        : "";
                      updateField("sharePrice", formatted);
                    }}
                    className="pl-7 text-base sm:text-sm"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Price per unit/interest in the fund
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
