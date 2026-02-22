"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ShieldCheck,
  CheckCircle,
  Circle,
  AlertCircle,
  FileText,
  Users,
  Scale,
} from "lucide-react";

interface ComplianceData {
  badActorCertified: boolean;
  badActorCertifiedAt: string | null;
  regulationDExemption: string | null;
  formDFilingDate: string | null;
  accreditedInvestors: number;
  totalInvestors: number;
  fundId: string | null;
}

const REG_D_LABELS: Record<string, string> = {
  "506B": "Rule 506(b)",
  "506C": "Rule 506(c)",
  "REG_A_PLUS": "Regulation A+",
  "RULE_504": "Rule 504",
};

export function ComplianceStatus() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/compliance-status", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch((e) => { if (e?.name !== "AbortError") console.error("Failed to load compliance status:", e); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-40 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const items = [
    {
      label: "Bad Actor Certification",
      status: data.badActorCertified ? "complete" : "incomplete",
      detail: data.badActorCertifiedAt
        ? `Completed ${new Date(data.badActorCertifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
        : "Not yet certified",
      href: "/admin/setup",
      icon: ShieldCheck,
    },
    {
      label: "Regulation D Exemption",
      status: data.regulationDExemption ? "complete" : "incomplete",
      detail: data.regulationDExemption
        ? `${REG_D_LABELS[data.regulationDExemption] || data.regulationDExemption} configured`
        : "Not configured",
      href: "/admin/settings",
      icon: Scale,
    },
    {
      label: "Investor Verification",
      status:
        data.totalInvestors === 0
          ? "incomplete"
          : data.accreditedInvestors === data.totalInvestors
            ? "complete"
            : "action",
      detail:
        data.totalInvestors === 0
          ? "No investors yet"
          : `${data.accreditedInvestors} of ${data.totalInvestors} investors verified`,
      href: "/admin/investors",
      icon: Users,
    },
    {
      label: "Form D Filing",
      status: data.formDFilingDate ? "complete" : "incomplete",
      detail: data.formDFilingDate
        ? `Filed ${new Date(data.formDFilingDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
        : "Not yet filed",
      href: data.fundId
        ? `/admin/reports?fundId=${data.fundId}`
        : "/admin/reports",
      icon: FileText,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          SEC Compliance
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2.5">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-start gap-2.5 group hover:bg-muted/50 rounded-md px-2 py-1.5 -mx-2 transition-colors"
            >
              {item.status === "complete" ? (
                <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
              ) : item.status === "action" ? (
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                  {item.detail}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
