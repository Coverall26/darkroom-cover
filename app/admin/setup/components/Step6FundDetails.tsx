"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Zap,
  FileSignature,
  PieChart,
  Users,
  DollarSign,
  Lock,
  Eye,
  EyeOff,
  Check,
  Info,
  ChevronDown,
  ChevronUp,
  Rocket,
  Building,
  Home,
  TrendingUp,
  Target,
  Search,
  Layers,
  Settings,
  Plus,
  Trash2,
  BarChart3,
} from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { WizardData } from "../hooks/useWizardState";
import { FUND_TYPE_DEFAULTS, type FundSubType } from "@/lib/validations/fund-types";
import { FundingStructurePreview } from "@/components/admin/funding-structure-preview";

const WATERFALL_TYPES = [
  { value: "EUROPEAN", label: "European (Whole Fund)" },
  { value: "AMERICAN", label: "American (Deal-by-Deal)" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

const INSTRUMENTS = [
  {
    value: "SAFE",
    label: "SAFE",
    icon: Zap,
    desc: "Simple Agreement for Future Equity. Most common for pre-seed/seed.",
  },
  {
    value: "CONVERTIBLE_NOTE",
    label: "Convertible Note",
    icon: FileSignature,
    desc: "Debt that converts to equity. Interest accrues. Has maturity date.",
  },
  {
    value: "PRICED_ROUND",
    label: "Priced Round",
    icon: PieChart,
    desc: "Series A+. Fixed share price. Full cap table impact.",
  },
  {
    value: "SPV",
    label: "SPV / Co-Invest",
    icon: Users,
    desc: "Special Purpose Vehicle for a single deal. Pool LPs into one entity.",
  },
];

const FUND_TYPE_CARDS = [
  { type: "VENTURE_CAPITAL", icon: Rocket, title: "Venture Capital", badge: "2/20, 10yr, European" },
  { type: "PRIVATE_EQUITY", icon: Building, title: "Private Equity", badge: "2/20, 7yr, European" },
  { type: "REAL_ESTATE", icon: Home, title: "Real Estate", badge: "1.5/20, 7yr, American" },
  { type: "HEDGE_FUND", icon: TrendingUp, title: "Hedge Fund", badge: "2/20, Open-ended, HWM" },
  { type: "SPV_COINVEST", icon: Target, title: "SPV / Co-Invest", badge: "0/20, Deal-by-deal" },
  { type: "SEARCH_FUND", icon: Search, title: "Search Fund", badge: "2/20, 2yr + 5yr" },
  { type: "FUND_OF_FUNDS", icon: Layers, title: "Fund of Funds", badge: "1/10, 10yr, European" },
  { type: "CUSTOM", icon: Settings, title: "Custom", badge: "No defaults" },
] as const;

const MARKETPLACE_CATEGORIES = [
  "Venture Capital",
  "Private Equity",
  "Real Estate",
  "Infrastructure",
  "Credit",
  "Multi-Strategy",
  "Other",
];

interface Step6Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

function CurrencyInput({
  label,
  required,
  placeholder,
  value,
  onChange,
  helper,
}: {
  label: string;
  required?: boolean;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  helper?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
          $
        </span>
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            onChange(raw ? Number(raw).toLocaleString("en-US") : "");
          }}
          className="pl-7 text-base sm:text-sm"
        />
      </div>
      {helper && <p className="text-xs text-gray-500">{helper}</p>}
    </div>
  );
}

function PctInput({
  label,
  required,
  placeholder,
  value,
  onChange,
  helper,
}: {
  label: string;
  required?: boolean;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  helper?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-8 text-base sm:text-sm"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
          %
        </span>
      </div>
      {helper && <p className="text-xs text-gray-500">{helper}</p>}
    </div>
  );
}

export default function Step6FundDetails({ data, updateField }: Step6Props) {
  const [showAcct, setShowAcct] = useState(false);
  const [showRouting, setShowRouting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(data.marketplaceInterest);
  const [showFundingStructure, setShowFundingStructure] = useState(
    (data.plannedRounds?.length > 0 || data.initialTiers?.length > 0),
  );

  const isGPFund = data.raiseMode === "GP_FUND";
  const isStartup = data.raiseMode === "STARTUP";

  const handleFundTypeSelect = useCallback(
    (type: string) => {
      updateField("fundSubType", type);
      const defaults = FUND_TYPE_DEFAULTS[type as FundSubType];
      if (defaults && type !== "CUSTOM") {
        updateField("mgmtFee", String(defaults.managementFeePct));
        updateField("carry", String(defaults.carryPct));
        if (defaults.termYears !== null) updateField("fundTerm", String(defaults.termYears));
        if (defaults.extensionYears !== null) updateField("extensionYears", String(defaults.extensionYears));
        if (defaults.hurdleRate !== null) updateField("hurdle", String(defaults.hurdleRate));
        if (defaults.waterfallType) updateField("waterfallType", defaults.waterfallType);
        updateField("highWaterMark", defaults.highWaterMark);
        toast.info(`Defaults applied for ${type.replace(/_/g, " ").toLowerCase()}`);
      }
    },
    [updateField],
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {isStartup ? "Raise Configuration" : "Fund Details"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {isStartup
            ? "Configure your startup raise instrument and terms."
            : "Configure your fund economics and wire instructions."}
        </p>
        <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Configure free &bull; Activate paid
        </span>
      </div>

      {/* GP FUND MODE */}
      {isGPFund && (
        <div className="space-y-6">
          {/* Fund Type Selector */}
          <div className="space-y-3">
            <Label>Fund Type</Label>
            <p className="text-xs text-gray-500 -mt-1">
              Select your fund structure. Defaults will pre-fill below.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FUND_TYPE_CARDS.map((card) => {
                const Icon = card.icon;
                const isActive = data.fundSubType === card.type;
                return (
                  <button
                    key={card.type}
                    onClick={() => handleFundTypeSelect(card.type)}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-lg border-2 text-left transition-all",
                      isActive
                        ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700",
                    )}
                  >
                    <Icon
                      size={16}
                      className={cn("mb-1", isActive ? "text-[#0066FF]" : "text-gray-400")}
                    />
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {card.title}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-0.5">
                      {card.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>
                Fund Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Growth Fund I"
                value={data.fundName}
                onChange={(e) => updateField("fundName", e.target.value)}
                className="text-base sm:text-sm"
              />
              <p className="text-xs text-gray-500">
                Used in all docs, LP portal, and Form D
              </p>
            </div>
            <CurrencyInput
              label="Target Raise"
              required
              placeholder="10,000,000"
              value={data.targetRaise}
              onChange={(v) => updateField("targetRaise", v)}
            />
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <select
                value={data.currency}
                onChange={(e) => updateField("currency", e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <CurrencyInput
            label="Minimum LP Commitment"
            placeholder="50,000"
            value={data.minimumCommitment}
            onChange={(v) => updateField("minimumCommitment", v)}
            helper="Minimum commitment amount per LP"
          />

          <div className="grid gap-4 sm:grid-cols-4">
            <PctInput
              label="Management Fee"
              placeholder="2.0"
              value={data.mgmtFee}
              onChange={(v) => updateField("mgmtFee", v)}
              helper="Standard 2/20 structure"
            />
            <PctInput
              label="Carried Interest"
              placeholder="20.0"
              value={data.carry}
              onChange={(v) => updateField("carry", v)}
              helper="GP profit share above hurdle"
            />
            <PctInput
              label="Hurdle Rate"
              placeholder="8.0"
              value={data.hurdle}
              onChange={(v) => updateField("hurdle", v)}
              helper="Preferred return threshold"
            />
            <div className="space-y-1.5">
              <Label>Fund Term</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="10"
                  value={data.fundTerm}
                  onChange={(e) => updateField("fundTerm", e.target.value)}
                  className="pr-14 text-base sm:text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  years
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Waterfall Type</Label>
              <select
                value={data.waterfallType}
                onChange={(e) => updateField("waterfallType", e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                <option value="">Select type</option>
                {WATERFALL_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Extension Years</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="2"
                  value={data.extensionYears}
                  onChange={(e) => updateField("extensionYears", e.target.value)}
                  className="pr-14 text-base sm:text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  years
                </span>
              </div>
              <p className="text-xs text-gray-500">Optional fund extension period</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px] self-end">
              <div>
                <p className="text-sm font-medium">High Water Mark</p>
                <p className="text-xs text-gray-500">Hedge fund style</p>
              </div>
              <Switch
                checked={data.highWaterMark}
                onCheckedChange={(v) => updateField("highWaterMark", v)}
              />
            </div>
          </div>

          {/* Advanced Fund Settings (collapsed) */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full px-4 py-3 text-left min-h-[44px]"
            >
              <div className="flex items-center gap-2">
                <Info size={16} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Advanced fund settings
                </span>
              </div>
              {showAdvanced ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </button>
            {showAdvanced && (
              <div className="px-4 pb-4 space-y-4 border-t">
                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <CurrencyInput
                    label="GP Commitment"
                    placeholder="500,000"
                    value={data.gpCommitment}
                    onChange={(v) => updateField("gpCommitment", v)}
                    helper="GP's own commitment to the fund"
                  />
                  <div className="space-y-1.5">
                    <Label>Investment Period</Label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="5"
                        value={data.investmentPeriod}
                        onChange={(e) => updateField("investmentPeriod", e.target.value)}
                        className="pr-14 text-base sm:text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                        years
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Active investment period before harvest</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px]">
                    <div>
                      <p className="text-sm font-medium">Recycling Provisions</p>
                      <p className="text-xs text-gray-500">Reinvest proceeds during investment period</p>
                    </div>
                    <Switch
                      checked={data.recyclingEnabled}
                      onCheckedChange={(v) => updateField("recyclingEnabled", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px]">
                    <div>
                      <p className="text-sm font-medium">Clawback Provision</p>
                      <p className="text-xs text-gray-500">GP returns excess carry distributions</p>
                    </div>
                    <Switch
                      checked={data.clawbackProvision}
                      onCheckedChange={(v) => updateField("clawbackProvision", v)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px]">
                    <div>
                      <p className="text-sm font-medium">Key Person Clause</p>
                      <p className="text-xs text-gray-500">Suspension trigger if key person departs</p>
                    </div>
                    <Switch
                      checked={data.keyPersonEnabled}
                      onCheckedChange={(v) => updateField("keyPersonEnabled", v)}
                    />
                  </div>
                  {data.keyPersonEnabled && (
                    <div className="pl-4">
                      <Label>Key Person Name</Label>
                      <Input
                        placeholder="Managing Partner name"
                        value={data.keyPersonName}
                        onChange={(e) => updateField("keyPersonName", e.target.value)}
                        className="mt-1 text-base sm:text-sm"
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <PctInput
                    label="No-Fault Divorce"
                    placeholder="66.7"
                    value={data.noFaultDivorceThreshold}
                    onChange={(v) => updateField("noFaultDivorceThreshold", v)}
                    helper="LP vote threshold to remove GP"
                  />
                  <PctInput
                    label="Mgmt Fee Offset"
                    placeholder="100"
                    value={data.mgmtFeeOffset}
                    onChange={(v) => updateField("mgmtFeeOffset", v)}
                    helper="% of portfolio co fees offsetting mgmt fee"
                  />
                  <div className="space-y-1.5">
                    <Label>Preferred Return</Label>
                    <select
                      value={data.preferredReturnMethod}
                      onChange={(e) => updateField("preferredReturnMethod", e.target.value)}
                      className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                    >
                      <option value="COMPOUNDED">Compounded</option>
                      <option value="SIMPLE">Simple</option>
                    </select>
                    <p className="text-xs text-gray-500">Hurdle rate calculation method</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Marketplace Section (collapsed) */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => {
                setShowMarketplace(!showMarketplace);
                if (!showMarketplace) updateField("marketplaceInterest", true);
              }}
              className="flex items-center justify-between w-full px-4 py-3 text-left min-h-[44px]"
            >
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Marketplace Listing
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-700 rounded-full">
                  Coming Soon
                </span>
              </div>
              {showMarketplace ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </button>
            {showMarketplace && (
              <div className="px-4 pb-4 space-y-4 border-t mt-0 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Opt in to marketplace</p>
                    <p className="text-xs text-gray-500">Make your fund discoverable to qualified investors</p>
                  </div>
                  <Switch
                    checked={data.marketplaceInterest}
                    onCheckedChange={(v) => updateField("marketplaceInterest", v)}
                  />
                </div>
                {data.marketplaceInterest && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <textarea
                        maxLength={280}
                        placeholder="Brief description for potential investors..."
                        value={data.marketplaceDescription}
                        onChange={(e) => updateField("marketplaceDescription", e.target.value)}
                        className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 min-h-[80px] resize-none"
                      />
                      <p className="text-xs text-gray-400 text-right">
                        {data.marketplaceDescription.length}/280
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <select
                        value={data.marketplaceCategory}
                        onChange={(e) => updateField("marketplaceCategory", e.target.value)}
                        className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                      >
                        <option value="">Select category</option>
                        {MARKETPLACE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STARTUP MODE - Instrument Selector */}
      {isStartup && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INSTRUMENTS.map((inst) => {
              const Icon = inst.icon;
              const isSelected = data.instrumentType === inst.value;
              return (
                <button
                  key={inst.value}
                  onClick={() => updateField("instrumentType", inst.value)}
                  className={cn(
                    "relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                    isSelected
                      ? "border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700",
                  )}
                >
                  {isSelected && (
                    <Check size={14} className="absolute top-2 right-2 text-[#0066FF]" />
                  )}
                  <Icon
                    size={20}
                    className={cn("mb-2", isSelected ? "text-[#0066FF]" : "text-gray-400")}
                  />
                  <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    {inst.label}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">{inst.desc}</p>
                </button>
              );
            })}
          </div>

          {/* SAFE Fields */}
          {data.instrumentType === "SAFE" && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Round Name <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Pre-Seed"
                    value={data.roundName}
                    onChange={(e) => updateField("roundName", e.target.value)}
                  />
                </div>
                <CurrencyInput
                  label="Target Raise"
                  required
                  placeholder="1,000,000"
                  value={data.targetRaise}
                  onChange={(v) => updateField("targetRaise", v)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <CurrencyInput
                  label="Valuation Cap"
                  required
                  placeholder="10,000,000"
                  value={data.valCap}
                  onChange={(v) => updateField("valCap", v)}
                  helper="Max valuation at which SAFE converts"
                />
                <PctInput
                  label="Discount Rate"
                  placeholder="20"
                  value={data.discount}
                  onChange={(v) => updateField("discount", v)}
                  helper="15-25% typical"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>SAFE Type</Label>
                  <select
                    value={data.safeType}
                    onChange={(e) => updateField("safeType", e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="POST_MONEY">Post-Money</option>
                    <option value="PRE_MONEY">Pre-Money</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={data.mfn} onCheckedChange={(v) => updateField("mfn", v)} />
                  <div>
                    <p className="text-sm font-medium">MFN</p>
                    <p className="text-xs text-gray-500">Auto-inherits better terms</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={data.proRata} onCheckedChange={(v) => updateField("proRata", v)} />
                  <div>
                    <p className="text-sm font-medium">Pro-Rata Rights</p>
                    <p className="text-xs text-gray-500">Right to invest in future</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Convertible Note Fields */}
          {data.instrumentType === "CONVERTIBLE_NOTE" && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <CurrencyInput
                  label="Target Raise"
                  required
                  placeholder="500,000"
                  value={data.targetRaise}
                  onChange={(v) => updateField("targetRaise", v)}
                />
                <PctInput
                  label="Interest Rate"
                  required
                  placeholder="5.0"
                  value={data.interestRate}
                  onChange={(v) => updateField("interestRate", v)}
                  helper="Annual simple interest. 2-8% typical."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Maturity Date</Label>
                  <Input
                    type="date"
                    value={data.maturityDate}
                    onChange={(e) => updateField("maturityDate", e.target.value)}
                  />
                  <p className="text-xs text-gray-500">12-24 months typical</p>
                </div>
                <CurrencyInput
                  label="Qualified Financing Threshold"
                  placeholder="1,000,000"
                  value={data.qualFinancing}
                  onChange={(v) => updateField("qualFinancing", v)}
                  helper="Min raise to trigger auto-conversion"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <CurrencyInput
                  label="Valuation Cap"
                  placeholder="10,000,000"
                  value={data.valCap}
                  onChange={(v) => updateField("valCap", v)}
                />
                <PctInput
                  label="Discount Rate"
                  placeholder="20"
                  value={data.discount}
                  onChange={(v) => updateField("discount", v)}
                />
              </div>
            </div>
          )}

          {/* Priced Round Fields */}
          {data.instrumentType === "PRICED_ROUND" && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Round Name <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Series A"
                    value={data.roundName}
                    onChange={(e) => updateField("roundName", e.target.value)}
                  />
                </div>
                <CurrencyInput
                  label="Target Raise"
                  required
                  placeholder="5,000,000"
                  value={data.targetRaise}
                  onChange={(v) => updateField("targetRaise", v)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <CurrencyInput
                  label="Pre-Money Valuation"
                  required
                  placeholder="20,000,000"
                  value={data.preMoneyVal}
                  onChange={(v) => updateField("preMoneyVal", v)}
                />
                <div className="space-y-1.5">
                  <Label>Liquidation Preference</Label>
                  <select
                    value={data.liqPref}
                    onChange={(e) => updateField("liqPref", e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="1X_NON_PARTICIPATING">1x Non-Participating</option>
                    <option value="1X_PARTICIPATING">1x Participating</option>
                    <option value="2X_NON_PARTICIPATING">2x Non-Participating</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Anti-Dilution</Label>
                  <select
                    value={data.antiDilution}
                    onChange={(e) => updateField("antiDilution", e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="BROAD_BASED_WEIGHTED_AVG">Broad-Based Weighted Average</option>
                    <option value="FULL_RATCHET">Full Ratchet</option>
                  </select>
                </div>
                <PctInput
                  label="Option Pool"
                  placeholder="10"
                  value={data.optionPool}
                  onChange={(v) => updateField("optionPool", v)}
                  helper="ESOP reserved. 10-20% typical."
                />
                <div className="space-y-1.5">
                  <Label>Board Seats</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={data.boardSeats}
                    onChange={(e) => updateField("boardSeats", e.target.value)}
                    className="text-base sm:text-sm"
                  />
                  <p className="text-xs text-gray-500">Investor board seats</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px]">
                  <div>
                    <p className="text-sm font-medium">Protective Provisions</p>
                    <p className="text-xs text-gray-500">Investor veto on major changes</p>
                  </div>
                  <Switch checked={data.protectiveProvisions} onCheckedChange={(v) => updateField("protectiveProvisions", v)} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px]">
                  <div>
                    <p className="text-sm font-medium">Information Rights</p>
                    <p className="text-xs text-gray-500">Financial statements access</p>
                  </div>
                  <Switch checked={data.informationRights} onCheckedChange={(v) => updateField("informationRights", v)} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px]">
                  <div>
                    <p className="text-sm font-medium">ROFR &amp; Co-Sale</p>
                    <p className="text-xs text-gray-500">Right of first refusal + co-sale rights</p>
                  </div>
                  <Switch checked={data.rofrCoSale} onCheckedChange={(v) => updateField("rofrCoSale", v)} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 min-h-[44px]">
                  <div>
                    <p className="text-sm font-medium">Drag-Along</p>
                    <p className="text-xs text-gray-500">Force minority to sell</p>
                  </div>
                  <Switch checked={data.dragAlong} onCheckedChange={(v) => updateField("dragAlong", v)} />
                </div>
              </div>
            </div>
          )}

          {/* SPV Fields */}
          {data.instrumentType === "SPV" && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>SPV Name <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Acme Co-Invest SPV LLC"
                    value={data.spvName}
                    onChange={(e) => updateField("spvName", e.target.value)}
                  />
                  <p className="text-xs text-gray-500">Legal entity name for the SPV</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Target Company <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Target Company Inc."
                    value={data.targetCompanyName}
                    onChange={(e) => updateField("targetCompanyName", e.target.value)}
                  />
                  <p className="text-xs text-gray-500">Company being invested in</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Deal Description</Label>
                <textarea
                  maxLength={280}
                  placeholder="Describe the deal and investment thesis..."
                  value={data.dealDescription}
                  onChange={(e) => updateField("dealDescription", e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 min-h-[80px] resize-none"
                />
                <p className="text-xs text-gray-400 text-right">{data.dealDescription.length}/280</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <CurrencyInput
                  label="Total Allocation"
                  required
                  placeholder="2,000,000"
                  value={data.allocationAmount}
                  onChange={(v) => updateField("allocationAmount", v)}
                  helper="Total SPV allocation"
                />
                <CurrencyInput
                  label="Minimum LP Investment"
                  placeholder="25,000"
                  value={data.minimumLpInvestment}
                  onChange={(v) => updateField("minimumLpInvestment", v)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <PctInput
                  label="Management Fee"
                  placeholder="0"
                  value={data.spvMgmtFee}
                  onChange={(v) => updateField("spvMgmtFee", v)}
                  helper="0-2% typical for SPVs"
                />
                <PctInput
                  label="Carried Interest"
                  placeholder="20"
                  value={data.spvCarry}
                  onChange={(v) => updateField("spvCarry", v)}
                  helper="GP profit share"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <CurrencyInput
                  label="GP Commitment"
                  placeholder="50,000"
                  value={data.spvGpCommitment}
                  onChange={(v) => updateField("spvGpCommitment", v)}
                />
                <div className="space-y-1.5">
                  <Label>Max Investors</Label>
                  <Input
                    type="number"
                    placeholder="99"
                    value={data.maxInvestors}
                    onChange={(e) => updateField("maxInvestors", e.target.value)}
                    className="text-base sm:text-sm"
                  />
                  <p className="text-xs text-gray-500">249 max for Reg D</p>
                </div>
                <div className="space-y-1.5">
                  <Label>SPV Term</Label>
                  <select
                    value={data.spvTerm}
                    onChange={(e) => updateField("spvTerm", e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="">Select term</option>
                    <option value="DEAL_COMPLETION">Deal completion</option>
                    <option value="1_YEAR">1 year</option>
                    <option value="3_YEARS">3 years</option>
                    <option value="5_YEARS">5 years</option>
                    <option value="10_YEARS">10 years</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEC / Investment Company Act (GP Fund only) */}
      {isGPFund && (
        <div className="space-y-4 border-t pt-6">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              SEC / Investment Company Act
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Required for Form D filing and SEC compliance.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Investment Company Act Exemption</Label>
              <select
                value={data.investmentCompanyExemption}
                onChange={(e) => updateField("investmentCompanyExemption", e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                <option value="">Select exemption</option>
                <option value="3C1">Section 3(c)(1) — Max 100 investors</option>
                <option value="3C7">Section 3(c)(7) — Qualified purchasers only</option>
              </select>
              <p className="text-xs text-gray-500">
                3(c)(1): up to 100 beneficial owners. 3(c)(7): unlimited qualified purchasers ($5M+ investments).
              </p>
            </div>
            <CurrencyInput
              label="Sales Commissions"
              value={data.salesCommissions}
              onChange={(v) => updateField("salesCommissions", v)}
              placeholder="0"
              helper="Form D Item 16 — Total commissions paid to placement agents or broker-dealers."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Use of Proceeds</Label>
            <textarea
              placeholder="Describe intended use of proceeds (e.g., portfolio company acquisitions, working capital, follow-on investments)..."
              value={data.useOfProceeds}
              onChange={(e) => updateField("useOfProceeds", e.target.value)}
              maxLength={1000}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 min-h-[80px] resize-none"
            />
            <p className="text-xs text-gray-500">
              Form D Item 15 — {data.useOfProceeds.length}/1000 characters.
            </p>
          </div>
        </div>
      )}

      {/* Funding Structure (Both Modes) */}
      <div className="space-y-4 border-t pt-6">
        <button
          type="button"
          onClick={() => setShowFundingStructure(!showFundingStructure)}
          className="flex items-center justify-between w-full"
        >
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BarChart3 size={18} className="text-[#0066FF]" />
              Funding Structure
            </h3>
            <p className="text-xs text-gray-500 mt-1 text-left">
              {isStartup
                ? "Plan future funding rounds beyond your initial round."
                : "Configure initial pricing tiers for unit-based fundraising."}
            </p>
          </div>
          {showFundingStructure ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {showFundingStructure && isStartup && (
          <div className="space-y-4 pt-2">
            {/* Have you raised before? */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Have you raised before?
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add completed rounds to show your fundraising history.
                </p>
              </div>
              <Switch
                checked={
                  (data.plannedRounds || []).some(
                    (r) => r.roundName && r.targetAmount,
                  ) || false
                }
                onCheckedChange={(checked) => {
                  if (checked && (!data.plannedRounds || data.plannedRounds.length === 0)) {
                    updateField("plannedRounds", [
                      {
                        roundName: "Pre-Seed",
                        targetAmount: "",
                        instrumentType: "SAFE",
                        valuationCap: "",
                        discount: "20",
                        notes: "",
                      },
                    ]);
                  } else if (!checked) {
                    updateField("plannedRounds", []);
                  }
                }}
              />
            </div>

            {/* Active Round Summary */}
            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#0066FF]" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Active: {data.roundName || "Seed Round"}
                </span>
                <span className="text-xs text-gray-500">
                  {data.instrumentType || "SAFE"}
                </span>
              </div>
              <p className="text-xs text-gray-500 pl-4">
                Target: {data.targetRaise ? `$${data.targetRaise}` : "Not set"}
                {data.valCap && ` · Val Cap: $${data.valCap}`}
                {data.discount && ` · Discount: ${data.discount}%`}
              </p>
            </div>

            {/* Planned Rounds */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Planned Future Rounds
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const newRounds = [
                      ...(data.plannedRounds || []),
                      {
                        roundName: "",
                        targetAmount: "",
                        instrumentType: "SAFE",
                        valuationCap: "",
                        discount: "",
                        notes: "",
                      },
                    ];
                    updateField("plannedRounds", newRounds);
                  }}
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-blue-700 font-medium"
                >
                  <Plus size={14} /> Add Round
                </button>
              </div>

              {(!data.plannedRounds || data.plannedRounds.length === 0) && (
                <p className="text-xs text-gray-400 italic py-2">
                  No planned rounds yet. Add future rounds to preview your fundraising roadmap.
                </p>
              )}

              {(data.plannedRounds || []).map((round, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        Planned Round {idx + 2}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(data.plannedRounds || [])];
                        updated.splice(idx, 1);
                        updateField("plannedRounds", updated);
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Round Name</Label>
                      <Input
                        placeholder="Series A"
                        value={round.roundName}
                        onChange={(e) => {
                          const updated = [...(data.plannedRounds || [])];
                          updated[idx] = { ...updated[idx], roundName: e.target.value };
                          updateField("plannedRounds", updated);
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Instrument</Label>
                      <select
                        value={round.instrumentType}
                        onChange={(e) => {
                          const updated = [...(data.plannedRounds || [])];
                          updated[idx] = { ...updated[idx], instrumentType: e.target.value };
                          updateField("plannedRounds", updated);
                        }}
                        className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                      >
                        <option value="SAFE">SAFE</option>
                        <option value="CONVERTIBLE_NOTE">Convertible Note</option>
                        <option value="PRICED_ROUND">Priced Round</option>
                        <option value="SPV">SPV</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CurrencyInput
                      label="Target Amount"
                      placeholder="5,000,000"
                      value={round.targetAmount}
                      onChange={(v) => {
                        const updated = [...(data.plannedRounds || [])];
                        updated[idx] = { ...updated[idx], targetAmount: v };
                        updateField("plannedRounds", updated);
                      }}
                    />
                    <CurrencyInput
                      label="Valuation Cap"
                      placeholder="20,000,000"
                      value={round.valuationCap}
                      onChange={(v) => {
                        const updated = [...(data.plannedRounds || [])];
                        updated[idx] = { ...updated[idx], valuationCap: v };
                        updateField("plannedRounds", updated);
                      }}
                    />
                    <PctInput
                      label="Discount"
                      placeholder="20"
                      value={round.discount}
                      onChange={(v) => {
                        const updated = [...(data.plannedRounds || [])];
                        updated[idx] = { ...updated[idx], discount: v };
                        updateField("plannedRounds", updated);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800/50">
              <Info size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500">
                Planned rounds are created with &quot;Planned&quot; status. You can activate and configure them later from Fund Settings.
              </p>
            </div>
          </div>
        )}

        {showFundingStructure && isGPFund && (
          <div className="space-y-4 pt-2">
            {/* Tier Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pricing Tiers
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const tiers = data.initialTiers || [];
                    const nextTranche = tiers.length > 0
                      ? Math.max(...tiers.map((t) => t.tranche)) + 1
                      : 1;
                    updateField("initialTiers", [
                      ...tiers,
                      {
                        tranche: nextTranche,
                        name: `Tranche ${nextTranche}`,
                        pricePerUnit: "",
                        unitsAvailable: "",
                      },
                    ]);
                  }}
                  className="flex items-center gap-1 text-xs text-[#0066FF] hover:text-blue-700 font-medium"
                >
                  <Plus size={14} /> Add Tier
                </button>
              </div>

              {(!data.initialTiers || data.initialTiers.length === 0) && (
                <div className="text-center py-4 space-y-2">
                  <p className="text-xs text-gray-400 italic">
                    No pricing tiers configured. Add tiers to set up unit-based pricing for your fund.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      updateField("initialTiers", [
                        { tranche: 1, name: "Early Investor", pricePerUnit: "90,000", unitsAvailable: "25" },
                        { tranche: 2, name: "Standard", pricePerUnit: "95,000", unitsAvailable: "25" },
                        { tranche: 3, name: "Late Close", pricePerUnit: "100,000", unitsAvailable: "20" },
                      ]);
                      toast.success("Default pricing tiers added — adjust to fit your fund.");
                    }}
                    className="text-xs text-[#0066FF] hover:text-blue-700 font-medium underline underline-offset-2"
                  >
                    Pre-populate with suggested defaults
                  </button>
                </div>
              )}

              {(data.initialTiers || []).map((tier, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      Tier {tier.tranche}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(data.initialTiers || [])];
                        updated.splice(idx, 1);
                        updateField("initialTiers", updated);
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        placeholder="Early Investor"
                        value={tier.name}
                        onChange={(e) => {
                          const updated = [...(data.initialTiers || [])];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          updateField("initialTiers", updated);
                        }}
                        className="text-sm"
                      />
                    </div>
                    <CurrencyInput
                      label="Price per Unit"
                      required
                      placeholder="100"
                      value={tier.pricePerUnit}
                      onChange={(v) => {
                        const updated = [...(data.initialTiers || [])];
                        updated[idx] = { ...updated[idx], pricePerUnit: v };
                        updateField("initialTiers", updated);
                      }}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Units Available <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="text"
                        placeholder="10,000"
                        value={tier.unitsAvailable}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          const updated = [...(data.initialTiers || [])];
                          updated[idx] = {
                            ...updated[idx],
                            unitsAvailable: raw ? Number(raw).toLocaleString("en-US") : "",
                          };
                          updateField("initialTiers", updated);
                        }}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800/50">
              <Info size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500">
                Pricing tiers define unit-based pricing. Earlier tiers typically offer lower prices. You can add more tiers later from Fund Settings.
              </p>
            </div>
          </div>
        )}

        {/* Inline Preview Chart */}
        {showFundingStructure && (
          <FundingStructurePreview
            mode={data.raiseMode as "GP_FUND" | "STARTUP" | ""}
            tiers={(data.initialTiers || []).map((t) => ({
              tranche: t.tranche,
              name: t.name,
              pricePerUnit: t.pricePerUnit,
              unitsAvailable: t.unitsAvailable,
            }))}
            rounds={[
              ...(data.roundName
                ? [
                    {
                      roundName: data.roundName || "Seed Round",
                      targetAmount: data.targetRaise || "0",
                      instrumentType: data.instrumentType || "SAFE",
                      valuationCap: data.valCap || "",
                      discount: data.discount || "",
                      status: "ACTIVE" as const,
                    },
                  ]
                : []),
              ...(data.plannedRounds || []).map((r) => ({
                roundName: r.roundName,
                targetAmount: r.targetAmount,
                instrumentType: r.instrumentType,
                valuationCap: r.valuationCap,
                discount: r.discount,
                status: "PLANNED" as const,
              })),
            ]}
          />
        )}
      </div>

      {/* Wire Instructions (Both Modes) */}
      <div className="space-y-4 border-t pt-6">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Wiring Instructions
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Displayed to LPs during funding step. Sensitive fields encrypted AES-256.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bank Name <span className="text-red-500">*</span></Label>
            <Input
              placeholder="JPMorgan Chase"
              value={data.bankName}
              onChange={(e) => updateField("bankName", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Name <span className="text-red-500">*</span></Label>
            <Input
              placeholder={data.companyName || "Company Name"}
              value={data.accountName}
              onChange={(e) => updateField("accountName", e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Account Number <span className="text-red-500">*</span></Label>
            <div className="relative">
              <Input
                type={showAcct ? "text" : "password"}
                placeholder="••••••••••"
                value={data.accountNumber}
                onChange={(e) => updateField("accountNumber", e.target.value)}
                className="pr-10 font-mono"
              />
              <button
                onClick={() => setShowAcct(!showAcct)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showAcct ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              <Lock size={10} className="inline mr-1" />
              Encrypted at rest
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Routing Number <span className="text-red-500">*</span></Label>
            <div className="relative">
              <Input
                type={showRouting ? "text" : "password"}
                placeholder="••••••••"
                value={data.routingNumber}
                onChange={(e) => updateField("routingNumber", e.target.value)}
                className="pr-10 font-mono"
              />
              <button
                onClick={() => setShowRouting(!showRouting)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showRouting ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              <Lock size={10} className="inline mr-1" />
              Encrypted at rest
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>SWIFT/BIC</Label>
            <Input
              placeholder="CHASUS33"
              value={data.swift}
              onChange={(e) => updateField("swift", e.target.value)}
            />
            <p className="text-xs text-gray-500">For international wires</p>
          </div>
          <div className="space-y-1.5">
            <Label>Memo Format</Label>
            <Input
              placeholder="[Investor Name] - [Fund Name] - [Amount]"
              value={data.memoFormat}
              onChange={(e) => updateField("memoFormat", e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Intermediary Bank</Label>
            <Input
              placeholder="For international transfers"
              value={data.wireIntermediaryBank}
              onChange={(e) => updateField("wireIntermediaryBank", e.target.value)}
            />
            <p className="text-xs text-gray-500">Required for some international wires</p>
          </div>
          <div className="space-y-1.5">
            <Label>Wire Currency</Label>
            <select
              value={data.wireCurrency || data.currency || "USD"}
              onChange={(e) => updateField("wireCurrency", e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Special Instructions</Label>
          <textarea
            placeholder="Additional wire instructions for LPs..."
            value={data.wireSpecialInstructions}
            onChange={(e) => updateField("wireSpecialInstructions", e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 min-h-[60px] resize-none"
          />
        </div>
      </div>
    </div>
  );
}
