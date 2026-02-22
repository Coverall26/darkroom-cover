"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CreditCard,
  Check,
  Zap,
  Crown,
  Sparkles,
  Users,
  FileSignature,
  Mail,
  BarChart3,
  Loader2,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TierData {
  tier: string;
  aiCrmEnabled: boolean;
  maxContacts: number | null;
  maxEsigsPerMonth: number | null;
  emailTemplateLimit: number | null;
  hasKanban: boolean;
  hasOutreachQueue: boolean;
  hasEmailTracking: boolean;
  hasLpOnboarding: boolean;
  hasAiFeatures: boolean;
}

interface UsageData {
  contacts: { used: number; limit: number | null };
  esigs: { used: number; limit: number | null };
  templates: { used: number; limit: number | null };
}

interface BillingStatus {
  tier: string;
  aiCrmEnabled: boolean;
  aiTrialEndsAt: string | null;
  monthlyPrice: number;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

// ---------------------------------------------------------------------------
// Plan definitions for comparison cards
// ---------------------------------------------------------------------------

const PLANS = [
  {
    key: "FREE",
    name: "Free",
    price: "$0",
    period: "",
    icon: Users,
    color: "gray",
    features: [
      "20 contacts",
      "10 e-signatures/mo",
      "2 email templates",
      "Table view",
      "Basic analytics",
    ],
    cta: "Current Plan",
  },
  {
    key: "CRM_PRO",
    name: "CRM Pro",
    price: "$20",
    period: "/mo",
    icon: Zap,
    color: "blue",
    popular: true,
    features: [
      "Unlimited contacts",
      "25 e-signatures/mo",
      "5 email templates",
      "Kanban board",
      "Outreach queue",
      "Email tracking",
      "Custom branding",
      "API access",
    ],
    cta: "Upgrade",
  },
  {
    key: "FUNDROOM",
    name: "FundRoom",
    price: "$79",
    period: "/mo",
    icon: Crown,
    color: "purple",
    features: [
      "Everything in Pro",
      "Unlimited e-signatures",
      "Unlimited templates",
      "LP onboarding",
      "Deal pipeline",
      "Compliance pipeline",
      "White-label portal",
      "Priority support",
    ],
    cta: "Upgrade",
  },
];

const AI_ADDON = {
  name: "AI CRM Add-on",
  price: "$49",
  period: "/mo",
  trialDays: 14,
  features: [
    "AI email drafting",
    "AI insight cards",
    "Automated sequences",
    "Daily digest",
    "Unlimited templates",
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingCrmSection({ teamId }: { teamId: string }) {
  const [tierData, setTierData] = useState<TierData | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch tier + usage data
  const fetchData = useCallback(async () => {
    try {
      const [tierRes, usageRes] = await Promise.all([
        fetch("/api/tier"),
        fetch("/api/billing/usage"),
      ]);

      if (tierRes.ok) {
        const data = await tierRes.json();
        setTierData({
          tier: data.tier,
          aiCrmEnabled: data.aiCrmEnabled,
          maxContacts: data.limits?.maxContacts ?? null,
          maxEsigsPerMonth: data.limits?.maxEsigsPerMonth ?? null,
          emailTemplateLimit: data.limits?.emailTemplateLimit ?? null,
          hasKanban: data.limits?.hasKanban ?? false,
          hasOutreachQueue: data.limits?.hasOutreachQueue ?? false,
          hasEmailTracking: data.limits?.hasEmailTracking ?? false,
          hasLpOnboarding: data.limits?.hasLpOnboarding ?? false,
          hasAiFeatures: data.limits?.hasAiFeatures ?? false,
        });
        setBillingStatus({
          tier: data.tier,
          aiCrmEnabled: data.aiCrmEnabled,
          aiTrialEndsAt: data.aiTrialEndsAt ?? null,
          monthlyPrice: 0,
          billingInterval: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        });
      }

      if (usageRes.ok) {
        setUsageData(await usageRes.json());
      }
    } catch {
      // Non-critical — display available data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Actions
  const handleUpgrade = async (plan: string) => {
    setActionLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval: "monthly" }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Failed to create checkout session");
      }
    } catch {
      toast.error("Failed to initiate upgrade");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAiAddon = async (action: "subscribe" | "cancel") => {
    setActionLoading("ai-addon");
    try {
      const res = await fetch("/api/billing/ai-addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          action === "subscribe"
            ? "AI CRM add-on activated with 14-day trial!"
            : "AI CRM add-on will be cancelled at end of period",
        );
        fetchData();
      } else {
        toast.error(data.error || "Failed to update AI CRM add-on");
      }
    } catch {
      toast.error("Failed to update AI CRM add-on");
    } finally {
      setActionLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setActionLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to open billing portal");
      }
    } catch {
      toast.error("Failed to open billing portal");
    } finally {
      setActionLoading(null);
    }
  };

  const currentTier = tierData?.tier ?? "FREE";

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-lg border bg-muted/30"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Plan Comparison Cards ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          CRM Plans
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrentPlan = currentTier === plan.key;
            const PlanIcon = plan.icon;
            const colorMap: Record<string, string> = {
              gray: "border-gray-200 dark:border-gray-700",
              blue: "border-blue-500 dark:border-blue-400",
              purple: "border-purple-500 dark:border-purple-400",
            };
            const bgMap: Record<string, string> = {
              gray: "bg-gray-100 dark:bg-gray-800",
              blue: "bg-blue-100 dark:bg-blue-900/30",
              purple: "bg-purple-100 dark:bg-purple-900/30",
            };
            const iconColorMap: Record<string, string> = {
              gray: "text-gray-600 dark:text-gray-400",
              blue: "text-blue-600 dark:text-blue-400",
              purple: "text-purple-600 dark:text-purple-400",
            };

            return (
              <div
                key={plan.key}
                className={cn(
                  "relative flex flex-col rounded-lg border-2 p-4 transition-shadow hover:shadow-md",
                  isCurrentPlan
                    ? colorMap[plan.color]
                    : "border-border",
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}

                <div className="mb-3 flex items-center gap-2">
                  <div
                    className={cn(
                      "rounded-full p-2",
                      bgMap[plan.color],
                    )}
                  >
                    <PlanIcon
                      className={cn("h-4 w-4", iconColorMap[plan.color])}
                    />
                  </div>
                  <span className="font-semibold">{plan.name}</span>
                </div>

                <div className="mb-3">
                  <span className="font-mono text-2xl font-bold tabular-nums">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  )}
                </div>

                <ul className="mb-4 flex-1 space-y-1.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrentPlan ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="w-full"
                  >
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className={cn(
                      "w-full",
                      plan.color === "blue" &&
                        "bg-blue-600 text-white hover:bg-blue-700",
                      plan.color === "purple" &&
                        "bg-purple-600 text-white hover:bg-purple-700",
                    )}
                    disabled={actionLoading !== null}
                    onClick={() => handleUpgrade(plan.key)}
                  >
                    {actionLoading === plan.key ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowRight className="mr-1 h-3 w-3" />
                    )}
                    {plan.cta}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── AI CRM Add-on Card ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          AI Add-on
        </h3>
        <div
          className={cn(
            "rounded-lg border-2 p-4",
            tierData?.aiCrmEnabled
              ? "border-amber-400 bg-amber-50/30 dark:border-amber-600 dark:bg-amber-900/10"
              : "border-dashed border-muted-foreground/25",
          )}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-2.5 dark:bg-amber-900/30">
                <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold">{AI_ADDON.name}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono font-bold tabular-nums">
                    {AI_ADDON.price}
                  </span>
                  {AI_ADDON.period} &middot; {AI_ADDON.trialDays}-day free
                  trial
                </p>
              </div>
            </div>

            {tierData?.aiCrmEnabled ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Active
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading !== null}
                  onClick={() => handleAiAddon("cancel")}
                >
                  {actionLoading === "ai-addon" && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="bg-amber-600 text-white hover:bg-amber-700"
                disabled={
                  actionLoading !== null || currentTier === "FREE"
                }
                onClick={() => handleAiAddon("subscribe")}
              >
                {actionLoading === "ai-addon" ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                Start Free Trial
              </Button>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {AI_ADDON.features.map((f) => (
              <div
                key={f}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Check className="h-3 w-3 shrink-0 text-amber-500" />
                {f}
              </div>
            ))}
          </div>

          {currentTier === "FREE" && !tierData?.aiCrmEnabled && (
            <p className="mt-3 text-xs text-muted-foreground">
              AI CRM add-on requires CRM Pro or FundRoom plan. Upgrade
              first, then activate AI features.
            </p>
          )}

          {billingStatus?.aiTrialEndsAt && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Trial ends:{" "}
              {new Date(billingStatus.aiTrialEndsAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* ── Usage Meters ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Usage This Month
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <UsageMeter
            icon={Users}
            label="Contacts"
            used={usageData?.contacts.used ?? 0}
            limit={usageData?.contacts.limit ?? null}
          />
          <UsageMeter
            icon={FileSignature}
            label="E-Signatures"
            used={usageData?.esigs.used ?? 0}
            limit={usageData?.esigs.limit ?? null}
          />
          <UsageMeter
            icon={Mail}
            label="Email Templates"
            used={usageData?.templates.used ?? 0}
            limit={usageData?.templates.limit ?? null}
          />
        </div>
      </div>

      {/* ── Manage Billing ── */}
      {currentTier !== "FREE" && (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              Payment methods, invoices, and subscription management
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={actionLoading !== null}
            onClick={handleManageBilling}
          >
            {actionLoading === "portal" && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            <ExternalLink className="mr-1 h-3 w-3" />
            Billing Portal
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage Meter Sub-Component
// ---------------------------------------------------------------------------

function UsageMeter({
  icon: Icon,
  label,
  used,
  limit,
}: {
  icon: typeof Users;
  label: string;
  used: number;
  limit: number | null;
}) {
  const percentage = limit ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = limit ? percentage >= 80 : false;
  const isAtLimit = limit ? used >= limit : false;

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span
          className={cn(
            "font-mono text-xs font-bold tabular-nums",
            isAtLimit
              ? "text-red-600 dark:text-red-400"
              : isNearLimit
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground",
          )}
        >
          {used}
          {limit !== null ? ` / ${limit}` : " / ∞"}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            limit === null
              ? "w-0"
              : isAtLimit
                ? "bg-red-500"
                : isNearLimit
                  ? "bg-amber-500"
                  : "bg-blue-500",
          )}
          style={{ width: limit ? `${percentage}%` : "0%" }}
        />
      </div>
    </div>
  );
}
