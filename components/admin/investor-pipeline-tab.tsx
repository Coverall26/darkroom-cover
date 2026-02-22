"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Users,
  Search,
  ChevronRight,
  Loader2,
  UserCheck,
  Clock,
  Shield,
  DollarSign,
  CheckCircle2,
  XCircle,
  FileCheck2,
  Download,
} from "lucide-react";

interface PipelineStage {
  stage: string;
  label: string;
  count: number;
  description: string;
}

interface PipelineInvestor {
  id: string;
  name: string;
  email: string;
  entityName: string | null;
  entityType: string | null;
  commitment: number;
  funded: number;
  status: string;
  stage: string;
  accreditationStatus: string | null;
  ndaSigned: boolean;
  createdAt: string;
}

interface InvestorPipelineTabProps {
  fundId: string;
  teamId: string;
}

const STAGE_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof Users; bgColor: string }
> = {
  APPLIED: {
    label: "Applied",
    color: "text-blue-600",
    icon: Users,
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    color: "text-amber-600",
    icon: Clock,
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
  APPROVED: {
    label: "Approved",
    color: "text-emerald-600",
    icon: UserCheck,
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  REJECTED: {
    label: "Rejected",
    color: "text-red-600",
    icon: XCircle,
    bgColor: "bg-red-50 dark:bg-red-950/30",
  },
  COMMITTED: {
    label: "Committed",
    color: "text-purple-600",
    icon: Shield,
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  DOCS_APPROVED: {
    label: "Docs Approved",
    color: "text-indigo-600",
    icon: FileCheck2,
    bgColor: "bg-indigo-50 dark:bg-indigo-950/30",
  },
  FUNDED: {
    label: "Funded",
    color: "text-green-600",
    icon: DollarSign,
    bgColor: "bg-green-50 dark:bg-green-950/30",
  },
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function InvestorPipelineTab({ fundId, teamId }: InvestorPipelineTabProps) {
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [investors, setInvestors] = useState<PipelineInvestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [pipelineRes, investorsRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/investors/pipeline?fundId=${fundId}`),
        fetch(`/api/teams/${teamId}/investors?fundId=${fundId}`),
      ]);

      if (pipelineRes.ok) {
        const data = await pipelineRes.json();
        setPipeline(data.pipeline || []);
      }

      if (investorsRes.ok) {
        const data = await investorsRes.json();
        setInvestors(data.investors || []);
      }
    } catch (err) {
      console.error("Failed to fetch pipeline data:", err);
    } finally {
      setLoading(false);
    }
  }, [fundId, teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredInvestors = investors.filter((inv) => {
    const matchSearch =
      !search ||
      inv.name.toLowerCase().includes(search.toLowerCase()) ||
      inv.email.toLowerCase().includes(search.toLowerCase()) ||
      (inv.entityName || "").toLowerCase().includes(search.toLowerCase());

    const matchStage = !filterStage || inv.stage === filterStage;

    return matchSearch && matchStage;
  });

  const totalCommitted = investors.reduce((sum, inv) => sum + inv.commitment, 0);
  const totalFunded = investors.reduce((sum, inv) => sum + inv.funded, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pipeline Stage Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {(["APPLIED", "UNDER_REVIEW", "APPROVED", "COMMITTED", "DOCS_APPROVED", "FUNDED", "REJECTED"] as const).map(
          (stage) => {
            const config = STAGE_CONFIG[stage];
            const stageData = pipeline.find((p) => p.stage === stage);
            const count = stageData?.count || 0;
            const Icon = config.icon;
            const isActive = filterStage === stage;

            return (
              <Card
                key={stage}
                className={`cursor-pointer transition-all ${
                  isActive
                    ? "ring-2 ring-primary"
                    : "hover:shadow-md"
                } ${config.bgColor}`}
                onClick={() =>
                  setFilterStage(isActive ? null : stage)
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-4 w-4 ${config.color}`} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {config.label}
                    </span>
                  </div>
                  <p className={`text-2xl font-bold ${config.color}`}>
                    {count}
                  </p>
                </CardContent>
              </Card>
            );
          },
        )}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>
            <strong className="text-foreground">{investors.length}</strong> total
            investors
          </span>
          <span>
            <strong className="text-foreground">
              {formatCurrency(totalCommitted)}
            </strong>{" "}
            committed
          </span>
          <span>
            <strong className="text-foreground">
              {formatCurrency(totalFunded)}
            </strong>{" "}
            funded
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const headers = ["Name", "Email", "Entity", "Stage", "Commitment", "Funded", "NDA Signed"];
            const rows = filteredInvestors.map((inv) => [
              inv.entityName || inv.name,
              inv.email,
              inv.entityType || "",
              STAGE_CONFIG[inv.stage]?.label || inv.stage,
              inv.commitment.toString(),
              inv.funded.toString(),
              inv.ndaSigned ? "Yes" : "No",
            ]);
            const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `investors-pipeline-${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search investors by name, email, or entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Investor Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Investors{" "}
            {filterStage && (
              <Badge variant="secondary" className="ml-2">
                {STAGE_CONFIG[filterStage]?.label || filterStage}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterStage(null);
                  }}
                  className="ml-1 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {filteredInvestors.length} investor
            {filteredInvestors.length !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredInvestors.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No investors found
            </p>
          ) : (
            <div className="divide-y">
              {filteredInvestors.map((investor) => {
                const stageConfig =
                  STAGE_CONFIG[investor.stage] || STAGE_CONFIG.APPLIED;

                return (
                  <Link
                    key={investor.id}
                    href={`/admin/investors/${investor.id}`}
                    className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors -mx-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {investor.entityName || investor.name}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${stageConfig.color}`}
                        >
                          {stageConfig.label}
                        </Badge>
                        {investor.ndaSigned && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-sm text-muted-foreground truncate">
                          {investor.email}
                        </span>
                        {investor.entityType && (
                          <span className="text-xs text-muted-foreground">
                            {investor.entityType}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {formatCurrency(investor.commitment)}
                        </p>
                        {investor.funded > 0 && (
                          <p className="text-xs text-emerald-600">
                            {formatCurrency(investor.funded)} funded
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
