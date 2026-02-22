"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, CheckCircle2, Loader2 } from "lucide-react";

interface Investment {
  id: string;
  fundId: string;
  fundName: string;
  commitmentAmount: number;
  fundedAmount: number;
  status: string;
}

interface WireConfirmationPanelProps {
  investments: Investment[];
  actionLoading: string | null;
  onConfirmWire: (investmentId: string) => void;
}

/**
 * WireConfirmationPanel — Wire confirmation for committed investments.
 */
export function WireConfirmationPanel({
  investments,
  actionLoading,
  onConfirmWire,
}: WireConfirmationPanelProps) {
  const confirmableInvestments = investments.filter(
    (inv) => inv.status === "COMMITTED" || inv.status === "DOCS_APPROVED",
  );

  if (confirmableInvestments.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign size={16} />
          Wire Confirmation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {confirmableInvestments.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div>
                <p className="text-sm font-medium">{inv.fundName}</p>
                <p className="text-xs text-gray-500">
                  Commitment: ${inv.commitmentAmount?.toLocaleString()} | Funded:
                  ${inv.fundedAmount?.toLocaleString() || "0"}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => onConfirmWire(inv.id)}
                disabled={!!actionLoading}
                className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
              >
                {actionLoading === inv.id ? (
                  <Loader2 size={14} className="animate-spin mr-1" />
                ) : (
                  <CheckCircle2 size={14} className="mr-1" />
                )}
                Confirm Wire
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
