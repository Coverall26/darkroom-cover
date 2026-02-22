import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Banknote,
  FileCheck,
  UserPlus,
  Clock,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";

interface PendingActionsData {
  pendingWires: number;
  pendingDocs: number;
  needsReview: number;
  awaitingWire: number;
  total: number;
}

interface PendingActionsCardProps {
  pendingActions: PendingActionsData;
}

export function PendingActionsCard({ pendingActions }: PendingActionsCardProps) {
  if (pendingActions.total === 0) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          All caught up — no pending actions.
        </p>
      </div>
    );
  }

  return (
    <Card className="border-amber-200/80 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/15 shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-amber-500 flex items-center justify-center">
            <AlertCircle className="h-3.5 w-3.5 text-white" />
          </div>
          Action Required
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-bold font-mono h-5 px-1.5 ml-0.5">
            {pendingActions.total}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {pendingActions.pendingWires > 0 && (
            <Link
              href="/admin/fund"
              className="flex items-center gap-3 p-2.5 rounded-lg border bg-background/80 hover:bg-background hover:border-amber-300 dark:hover:border-amber-700 transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <Banknote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold font-mono tabular-nums">
                  {pendingActions.pendingWires}
                  <span className="font-sans font-medium ml-1 text-xs">
                    wire{pendingActions.pendingWires !== 1 ? "s" : ""}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">to confirm</p>
              </div>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-amber-600 transition-colors flex-shrink-0" />
            </Link>
          )}

          {pendingActions.pendingDocs > 0 && (
            <Link
              href="/admin/documents"
              className="flex items-center gap-3 p-2.5 rounded-lg border bg-background/80 hover:bg-background hover:border-blue-300 dark:hover:border-blue-700 transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <FileCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold font-mono tabular-nums">
                  {pendingActions.pendingDocs}
                  <span className="font-sans font-medium ml-1 text-xs">
                    doc{pendingActions.pendingDocs !== 1 ? "s" : ""}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">to review</p>
              </div>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-blue-600 transition-colors flex-shrink-0" />
            </Link>
          )}

          {pendingActions.needsReview > 0 && (
            <Link
              href="/admin/approvals"
              className="flex items-center gap-3 p-2.5 rounded-lg border bg-background/80 hover:bg-background hover:border-purple-300 dark:hover:border-purple-700 transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
                <UserPlus className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold font-mono tabular-nums">
                  {pendingActions.needsReview}
                  <span className="font-sans font-medium ml-1 text-xs">
                    investor{pendingActions.needsReview !== 1 ? "s" : ""}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">to review</p>
              </div>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-purple-600 transition-colors flex-shrink-0" />
            </Link>
          )}

          {pendingActions.awaitingWire > 0 && (
            <Link
              href="/admin/investors"
              className="flex items-center gap-3 p-2.5 rounded-lg border bg-background/80 hover:bg-background hover:border-emerald-300 dark:hover:border-emerald-700 transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold font-mono tabular-nums">
                  {pendingActions.awaitingWire}
                  <span className="font-sans font-medium ml-1 text-xs">
                    investor{pendingActions.awaitingWire !== 1 ? "s" : ""}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">awaiting wire</p>
              </div>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-emerald-600 transition-colors flex-shrink-0" />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
