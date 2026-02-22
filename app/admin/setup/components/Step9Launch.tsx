"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Building2,
  Palette,
  TrendingUp,
  FileText,
  DollarSign,
  Users,
  Copy,
  ExternalLink,
  Check,
  Rocket,
  Shield,
  Pencil,
  UserPlus,
  Settings,
  Landmark,
  AlertTriangle,
  Mail,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { WizardData } from "../hooks/useWizardState";

interface Step9Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
  onGoToStep: (step: number) => void;
  onComplete: () => void;
  completing: boolean;
}

function SummaryCard({
  title,
  icon: Icon,
  step,
  onEdit,
  children,
}: {
  title: string;
  icon: React.ElementType;
  step: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-[#0066FF]" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h4>
        </div>
        <button
          onClick={() => onEdit(step)}
          className="flex items-center gap-1 text-xs text-[#0066FF] hover:underline"
        >
          <Pencil size={12} />
          Edit
        </button>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        {children}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-right">
        {value || "—"}
      </span>
    </div>
  );
}

export default function Step9Launch({
  data,
  updateField,
  onGoToStep,
  onComplete,
  completing,
}: Step9Props) {
  const [copied, setCopied] = useState(false);

  const slug = (data.companyName || "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const shareableLink = `https://${data.customDomain || slug}.fundroom.ai/d/${slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
    }
  };

  const isDataroomOnly = data.raiseMode === "DATAROOM_ONLY";
  const isStartup = data.raiseMode === "STARTUP";
  const isGpFund = data.raiseMode === "GP_FUND";

  const modeLabel = isGpFund
    ? "GP / LP Fund"
    : isStartup
      ? "Startup Capital Raise"
      : "Dataroom Only";

  const regDLabel = (() => {
    switch (data.regDExemption) {
      case "506B": return "Rule 506(b)";
      case "506C": return "Rule 506(c)";
      case "REG_A_PLUS": return "Regulation A+";
      case "RULE_504": return "Rule 504";
      default: return data.regDExemption || "Not set";
    }
  })();

  // Validation gate: check completeness of each section
  const validationIssues = useMemo(() => {
    const issues: { step: number; message: string }[] = [];

    // Company Info (step 0)
    if (!data.companyName) issues.push({ step: 0, message: "Company name required" });
    if (!data.entityType) issues.push({ step: 0, message: "Entity type required" });
    if (!data.ein || data.ein.replace(/\D/g, "").length !== 9)
      issues.push({ step: 0, message: "Valid EIN required" });
    if (!data.badActorCertified)
      issues.push({ step: 0, message: "Bad Actor certification required" });

    // Raise Style (step 2)
    if (!data.raiseMode) issues.push({ step: 2, message: "Raise type required" });
    if (!isDataroomOnly && !data.regDExemption)
      issues.push({ step: 2, message: "Reg D exemption required" });

    // Fund Details (step 5) - skip for DATAROOM_ONLY
    if (!isDataroomOnly) {
      if (isGpFund && !data.fundName) issues.push({ step: 5, message: "Fund name required" });
      if (isStartup && !data.instrumentType)
        issues.push({ step: 5, message: "Instrument type required" });
      if (isStartup && data.instrumentType === "SPV" && !data.spvName)
        issues.push({ step: 5, message: "SPV name required" });
      if (!data.targetRaise && !(data.instrumentType === "SPV" && data.allocationAmount))
        issues.push({ step: 5, message: "Target raise required" });
      if (!data.bankName) issues.push({ step: 5, message: "Bank name required" });
      if (!data.accountNumber) issues.push({ step: 5, message: "Account number required" });
      if (!data.routingNumber) issues.push({ step: 5, message: "Routing number required" });
    }

    return issues;
  }, [data, isDataroomOnly, isGpFund, isStartup]);

  const isReadyToLaunch = validationIssues.length === 0;

  // Count valid team invites
  const validInviteCount = data.inviteEmails.filter(
    (e) => e.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()),
  ).length;

  // Count configured document templates
  const configuredTemplateCount = data.documentTemplates.filter(
    (t) => t.status !== "not_set",
  ).length;

  // Get fund/instrument display name
  const fundDisplayName = (() => {
    if (isGpFund) return data.fundName || "Not configured";
    if (isStartup) {
      if (data.instrumentType === "SPV") return data.spvName || "Not configured";
      return data.roundName || "Not configured";
    }
    return "N/A";
  })();

  // Get instrument type label
  const instrumentLabel = (() => {
    switch (data.instrumentType) {
      case "SAFE": return "SAFE";
      case "CONVERTIBLE_NOTE": return "Convertible Note";
      case "PRICED_ROUND": return "Priced Equity Round";
      case "SPV": return "SPV";
      default: return data.instrumentType || "Not set";
    }
  })();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Review &amp; Launch
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Review your configuration and activate your organization.
        </p>
      </div>

      {/* Validation Gate */}
      {!isReadyToLaunch && (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 dark:bg-amber-950/20 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Missing Required Information
            </h3>
          </div>
          <ul className="space-y-1.5">
            {validationIssues.map((issue, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  {issue.message}
                </span>
                <button
                  onClick={() => onGoToStep(issue.step)}
                  className="text-xs text-[#0066FF] hover:underline"
                >
                  Fix
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Company Info */}
        <SummaryCard title="Company" icon={Building2} step={0} onEdit={onGoToStep}>
          <p>{data.companyName || "Not set"}</p>
          <SummaryRow
            label="Entity"
            value={data.entityType || "Not set"}
          />
          <SummaryRow
            label="EIN"
            value={data.ein ? `••••${data.ein.replace(/\D/g, "").slice(-4)}` : "Not set"}
          />
          {data.jurisdiction && (
            <SummaryRow label="State" value={data.jurisdiction} />
          )}
          {data.yearIncorporated && (
            <SummaryRow label="Year" value={data.yearIncorporated} />
          )}
          {data.relatedPersons.length > 0 && (
            <SummaryRow
              label="Related Persons"
              value={`${data.relatedPersons.length} listed`}
            />
          )}
          <SummaryRow
            label="506(d)"
            value={
              data.badActorCertified ? (
                <span className="text-emerald-600 flex items-center gap-1">
                  <Check size={12} /> Certified
                </span>
              ) : (
                <span className="text-amber-600">Not certified</span>
              )
            }
          />
        </SummaryCard>

        {/* Branding */}
        <SummaryCard title="Branding" icon={Palette} step={1} onEdit={onGoToStep}>
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full border"
              style={{ backgroundColor: data.brandColor }}
            />
            <div
              className="h-4 w-4 rounded-full border"
              style={{ backgroundColor: data.accentColor }}
            />
            <span className="text-xs">
              {data.customDomain || "Default domain"}
            </span>
          </div>
          {data.description && (
            <p className="text-xs text-gray-400 truncate">{data.description}</p>
          )}
          {data.sector && (
            <SummaryRow label="Sector" value={data.sector} />
          )}
        </SummaryCard>

        {/* Raise Style */}
        <SummaryCard title="Raise Style" icon={TrendingUp} step={2} onEdit={onGoToStep}>
          <p>{modeLabel}</p>
          {!isDataroomOnly && (
            <SummaryRow label="Reg D" value={regDLabel} />
          )}
          {data.minInvestment && (
            <SummaryRow label="Min invest" value={`$${data.minInvestment}`} />
          )}
        </SummaryCard>

        {/* Team Invites */}
        <SummaryCard title="Team Invites" icon={UserPlus} step={3} onEdit={onGoToStep}>
          <p>
            {validInviteCount > 0
              ? `${validInviteCount} invite${validInviteCount > 1 ? "s" : ""} configured`
              : "No invites configured"}
          </p>
          {validInviteCount > 0 && (
            <div className="mt-1 space-y-0.5">
              {data.inviteEmails
                .filter((e) => e.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))
                .slice(0, 3)
                .map((email, i) => (
                  <p key={i} className="text-xs text-gray-400 flex items-center gap-1">
                    <Mail size={10} />
                    {email}
                    <span className="text-gray-300">
                      ({data.inviteRoles[data.inviteEmails.indexOf(email)] || "ADMIN"})
                    </span>
                  </p>
                ))}
              {validInviteCount > 3 && (
                <p className="text-xs text-gray-400">
                  +{validInviteCount - 3} more
                </p>
              )}
            </div>
          )}
        </SummaryCard>

        {/* Dataroom */}
        <SummaryCard title="Dataroom" icon={FileText} step={4} onEdit={onGoToStep}>
          <p>{data.dataroomName || data.companyName || "Not configured"}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.watermark && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500">
                Watermark
              </span>
            )}
            {data.requireEmail && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500">
                Email Gate
              </span>
            )}
            {data.linkExpiration && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500">
                Link Expiry
              </span>
            )}
          </div>
        </SummaryCard>

        {/* Fund Terms (skip for DATAROOM_ONLY) */}
        {!isDataroomOnly && (
          <SummaryCard title="Fund Terms" icon={DollarSign} step={5} onEdit={onGoToStep}>
            <p>{fundDisplayName}</p>
            {isStartup && (
              <SummaryRow label="Instrument" value={instrumentLabel} />
            )}
            {isGpFund && data.fundStrategy && (
              <SummaryRow label="Strategy" value={data.fundStrategy} />
            )}
            {(data.targetRaise || data.allocationAmount) && (
              <SummaryRow
                label="Target"
                value={`$${data.targetRaise || data.allocationAmount}`}
              />
            )}
            {isGpFund && (
              <>
                {data.mgmtFee && <SummaryRow label="Mgmt Fee" value={`${data.mgmtFee}%`} />}
                {data.carry && <SummaryRow label="Carry" value={`${data.carry}%`} />}
                {data.hurdle && <SummaryRow label="Hurdle" value={`${data.hurdle}%`} />}
              </>
            )}
            {isStartup && data.instrumentType === "SAFE" && (
              <>
                {data.valCap && <SummaryRow label="Val Cap" value={`$${data.valCap}`} />}
                {data.discount && <SummaryRow label="Discount" value={`${data.discount}%`} />}
                {data.safeType && <SummaryRow label="SAFE Type" value={data.safeType === "POST_MONEY" ? "Post-Money" : "Pre-Money"} />}
              </>
            )}
            {isStartup && data.instrumentType === "CONVERTIBLE_NOTE" && (
              <>
                {data.valCap && <SummaryRow label="Val Cap" value={`$${data.valCap}`} />}
                {data.discount && <SummaryRow label="Discount" value={`${data.discount}%`} />}
                {data.interestRate && <SummaryRow label="Interest" value={`${data.interestRate}%`} />}
                {data.maturityDate && <SummaryRow label="Maturity" value={data.maturityDate} />}
              </>
            )}
            {isStartup && data.instrumentType === "PRICED_ROUND" && (
              <>
                {data.preMoneyVal && <SummaryRow label="Pre-Money" value={`$${data.preMoneyVal}`} />}
                {data.liqPref && <SummaryRow label="Liq Pref" value={data.liqPref} />}
                {data.optionPool && <SummaryRow label="Option Pool" value={`${data.optionPool}%`} />}
              </>
            )}
            {isStartup && data.instrumentType === "SPV" && (
              <>
                {data.targetCompanyName && <SummaryRow label="Target" value={data.targetCompanyName} />}
                {data.spvCarry && <SummaryRow label="Carry" value={`${data.spvCarry}%`} />}
                {data.spvMgmtFee && <SummaryRow label="Mgmt Fee" value={`${data.spvMgmtFee}%`} />}
              </>
            )}
            {isGpFund && data.waterfallType && (
              <SummaryRow label="Waterfall" value={data.waterfallType === "EUROPEAN" ? "European" : "American"} />
            )}
            {isGpFund && data.investmentCompanyExemption && (
              <SummaryRow
                label="ICA Exemption"
                value={data.investmentCompanyExemption === "3C1" ? "3(c)(1)" : "3(c)(7)"}
              />
            )}
            {data.marketplaceInterest && (
              <SummaryRow label="Marketplace" value={<span className="text-emerald-600">Opted in</span>} />
            )}
          </SummaryCard>
        )}

        {/* Wire Instructions (skip for DATAROOM_ONLY) */}
        {!isDataroomOnly && (
          <SummaryCard title="Wire Instructions" icon={Landmark} step={5} onEdit={onGoToStep}>
            {data.bankName ? (
              <>
                <SummaryRow label="Bank" value={data.bankName} />
                {data.accountName && (
                  <SummaryRow label="Account Name" value={data.accountName} />
                )}
                <SummaryRow
                  label="Account #"
                  value={data.accountNumber ? `••••${data.accountNumber.slice(-4)}` : "Not set"}
                />
                <SummaryRow
                  label="Routing #"
                  value={data.routingNumber ? `••••${data.routingNumber.slice(-4)}` : "Not set"}
                />
                {data.swift && <SummaryRow label="SWIFT" value={data.swift} />}
                {data.wireCurrency && data.wireCurrency !== "USD" && (
                  <SummaryRow label="Currency" value={data.wireCurrency} />
                )}
              </>
            ) : (
              <p className="text-amber-600 text-xs flex items-center gap-1">
                <AlertTriangle size={12} />
                Not configured
              </p>
            )}
          </SummaryCard>
        )}

        {/* LP Onboarding (skip for DATAROOM_ONLY) */}
        {!isDataroomOnly && (
          <SummaryCard title="LP Onboarding" icon={Users} step={6} onEdit={onGoToStep}>
            <SummaryRow
              label="GP Approval"
              value={data.gpApproval ? "Required" : "Auto-approve"}
            />
            <SummaryRow
              label="Accreditation"
              value={
                data.accreditationMethod === "SELF_ACK_MIN_INVEST"
                  ? `Min Threshold ($${data.minimumInvestThreshold || "200K"})`
                  : "Self-Certification"
              }
            />
            <SummaryRow
              label="Documents"
              value={`${configuredTemplateCount} of ${data.documentTemplates.length} configured`}
            />
          </SummaryCard>
        )}

        {/* Integrations */}
        <SummaryCard
          title="Integrations"
          icon={Settings}
          step={isDataroomOnly ? 5 : 7}
          onEdit={onGoToStep}
        >
          <p>5 active integrations</p>
          <div className="mt-1 space-y-0.5">
            {["FundRoom Sign", "Secure Storage", "Audit Logging", "Email (Resend)", "Wire Transfer"].map((name) => (
              <p key={name} className="text-xs text-gray-400 flex items-center gap-1">
                <Check size={10} className="text-emerald-500" /> {name}
              </p>
            ))}
          </div>
        </SummaryCard>

        {/* Compliance */}
        <SummaryCard
          title="Compliance"
          icon={Shield}
          step={isDataroomOnly ? 5 : 7}
          onEdit={onGoToStep}
        >
          <SummaryRow
            label="Audit retention"
            value={`${data.auditRetention || "7"} years`}
          />
          <SummaryRow
            label="Export format"
            value={data.exportFormat || "CSV"}
          />
          <SummaryRow
            label="Form D reminder"
            value={data.formDReminder ? "Enabled" : "Disabled"}
          />
        </SummaryCard>
      </div>

      {/* Dataroom Status - FREE */}
      <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-5 dark:bg-emerald-950/20 dark:border-emerald-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300">
              Dataroom — Live
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
              FREE
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 rounded-md bg-white dark:bg-gray-900 border text-sm font-mono text-gray-600 dark:text-gray-400 truncate">
            {shareableLink}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} />
            )}
          </Button>
        </div>
      </div>

      {/* FundRoom Status - PAID */}
      {!isDataroomOnly && (
        <div className="rounded-lg border-2 border-[#0066FF]/30 bg-blue-50/50 p-5 dark:bg-blue-950/20 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-3">
            <Rocket size={16} className="text-[#0066FF]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              FundRoom — Configured
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
              ACTIVATE TO SUBSCRIBE
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">When activated:</p>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <li className="flex items-center gap-1.5">
              <Check size={12} className="text-emerald-500" /> &ldquo;I want to
              invest&rdquo; button goes live
            </li>
            <li className="flex items-center gap-1.5">
              <Check size={12} className="text-emerald-500" /> LP onboarding
              wizard accepts real signups
            </li>
            <li className="flex items-center gap-1.5">
              <Check size={12} className="text-emerald-500" /> Document signing
              active
            </li>
            <li className="flex items-center gap-1.5">
              <Check size={12} className="text-emerald-500" /> Commitment
              tracking + pipeline CRM
            </li>
          </ul>
        </div>
      )}

      {/* Progress Checklist */}
      <div className="rounded-lg border dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Setup Progress
        </h3>
        <div className="space-y-2">
          {[
            { label: "Company information", done: !!data.companyName && !!data.entityType && !!data.ein },
            { label: "Branding configured", done: !!data.brandColor },
            { label: "Raise type selected", done: !!data.raiseMode },
            { label: "Dataroom configured", done: !!(data.dataroomName || data.companyName) },
            ...(!isDataroomOnly
              ? [
                  { label: "Fund terms set", done: !!(data.fundName || data.roundName || data.spvName) },
                  { label: "Wire instructions", done: !!data.bankName && !!data.accountNumber },
                  { label: "LP onboarding settings", done: true },
                ]
              : []),
            { label: "Bad Actor certification", done: data.badActorCertified },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={cn(
                  "h-5 w-5 rounded-full flex items-center justify-center border",
                  item.done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-gray-300 dark:border-gray-600",
                )}
              >
                {item.done && <Check size={12} />}
              </div>
              <span
                className={cn(
                  "text-sm",
                  item.done
                    ? "text-gray-700 dark:text-gray-300"
                    : "text-gray-400",
                )}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Button */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() =>
            window.open(`${shareableLink}?preview=true`, "_blank")
          }
        >
          <ExternalLink size={14} className="mr-1" />
          Preview as Visitor
        </Button>
      </div>

      {/* Complete Setup */}
      <div className="border-t pt-6">
        {!isReadyToLaunch && (
          <p className="text-xs text-amber-600 mb-3 flex items-center gap-1">
            <AlertTriangle size={12} />
            Please resolve all required items above before launching.
          </p>
        )}
        <Button
          size="lg"
          onClick={onComplete}
          disabled={completing || !isReadyToLaunch}
          className="w-full sm:w-auto bg-[#0066FF] hover:bg-[#0052CC] text-white"
        >
          {completing ? (
            <>
              <span className="animate-spin mr-2">&#10227;</span>
              Creating...
            </>
          ) : (
            <>
              <Rocket size={16} className="mr-2" />
              Complete Setup
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
