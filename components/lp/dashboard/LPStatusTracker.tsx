"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  UserPlus,
  ShieldCheck,
} from "lucide-react";

interface Fund {
  id: string;
  name: string;
  investment?: { status: string };
}

interface LPStatusTrackerProps {
  funds: Fund[];
  ndaSigned: boolean;
  accreditationStatus: string;
  multipleShown?: boolean;
}

/**
 * LPStatusTracker — Investment progress steps (Applied → Funded).
 * 5-stage visual tracker per fund investment.
 */
export function LPStatusTracker({
  funds,
  ndaSigned,
  accreditationStatus,
  multipleShown,
}: LPStatusTrackerProps) {
  const stages = [
    { key: "APPLIED", label: "Applied", icon: UserPlus },
    { key: "NDA_SIGNED", label: "NDA Signed", icon: FileText },
    { key: "ACCREDITED", label: "Accredited", icon: ShieldCheck },
    { key: "COMMITTED", label: "Committed", icon: CheckCircle2 },
    { key: "FUNDED", label: "Funded", icon: DollarSign },
  ];

  const getStageStatus = (stageKey: string, investmentStatus: string) => {
    const ndaDone = ndaSigned === true;
    const accDone = accreditationStatus !== "PENDING" && !!accreditationStatus;
    const isCommitted = ["COMMITTED", "DOCS_APPROVED", "FUNDED"].includes(investmentStatus);
    const isFunded = investmentStatus === "FUNDED";

    const stageOrder = ["APPLIED", "NDA_SIGNED", "ACCREDITED", "COMMITTED", "FUNDED"];
    const completedSet = new Set<string>(["APPLIED"]);
    if (ndaDone) completedSet.add("NDA_SIGNED");
    if (ndaDone && accDone) completedSet.add("ACCREDITED");
    if (isCommitted) completedSet.add("COMMITTED");
    if (isFunded) completedSet.add("FUNDED");

    if (completedSet.has(stageKey)) return "completed";
    const firstIncomplete = stageOrder.find((s) => !completedSet.has(s));
    if (stageKey === firstIncomplete) return "current";
    return "pending";
  };

  return (
    <Card className="bg-gray-800/50 border-gray-700 mb-6 sm:mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center text-lg">
          <TrendingUp className="h-5 w-5 mr-2 text-blue-500" />
          Investment Status
        </CardTitle>
        <CardDescription className="text-gray-400">
          Your journey from commitment to funded investor
        </CardDescription>
      </CardHeader>
      <CardContent>
        {funds.map((fund) => {
          const investmentStatus = fund.investment?.status || "APPLIED";
          return (
            <div key={fund.id} className="mb-4 last:mb-0">
              {multipleShown && (
                <p className="text-sm text-gray-400 mb-3">{fund.name}</p>
              )}
              <div className="flex items-center justify-between overflow-x-auto scrollbar-hide">
                {stages.map((stage, i) => {
                  const stageStatus = getStageStatus(stage.key, investmentStatus);
                  const Icon = stage.icon;
                  return (
                    <div key={stage.key} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors min-h-[44px] min-w-[44px] ${
                            stageStatus === "completed"
                              ? "bg-emerald-600"
                              : stageStatus === "current"
                                ? "bg-blue-600 ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800 animate-pulse"
                                : "bg-gray-700"
                          }`}
                        >
                          {stageStatus === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 text-white" />
                          ) : (
                            <Icon
                              className={`h-5 w-5 ${stageStatus === "current" ? "text-white" : "text-gray-500"}`}
                            />
                          )}
                        </div>
                        <span
                          className={`text-xs mt-1.5 whitespace-nowrap ${
                            stageStatus === "completed"
                              ? "text-emerald-400 font-medium"
                              : stageStatus === "current"
                                ? "text-blue-400 font-medium"
                                : "text-gray-500"
                          }`}
                        >
                          {stage.label}
                        </span>
                      </div>
                      {i < stages.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 mx-2 ${
                            getStageStatus(stages[i + 1].key, investmentStatus) ===
                              "completed" || stageStatus === "completed"
                              ? "bg-emerald-600"
                              : "bg-gray-700"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
