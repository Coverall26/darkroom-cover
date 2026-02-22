"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Shield, DollarSign } from "lucide-react";

interface Investment {
  id: string;
  fundId: string;
  fundName: string;
  commitmentAmount: number;
  fundedAmount: number;
  status: string;
}

interface InvestorSummaryCardsProps {
  entityType: string | null;
  entityName: string | null;
  phone: string | null;
  ndaSigned: boolean;
  accreditationStatus: string | null;
  investments: Investment[];
}

/**
 * InvestorSummaryCards — 3-card grid showing Identity, Compliance, and Commitment.
 */
export function InvestorSummaryCards({
  entityType,
  entityName,
  phone,
  ndaSigned,
  accreditationStatus,
  investments,
}: InvestorSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User size={14} /> Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="text-gray-500">Entity:</span>{" "}
            {entityType || "Individual"}
          </div>
          {entityName && (
            <div>
              <span className="text-gray-500">Entity Name:</span>{" "}
              {entityName}
            </div>
          )}
          <div>
            <span className="text-gray-500">Phone:</span>{" "}
            {phone || "Not provided"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield size={14} /> Compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">NDA:</span>
            {ndaSigned ? (
              <Badge variant="outline" className="text-emerald-600">
                Signed
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600">
                Pending
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Accreditation:</span>
            <Badge
              variant="outline"
              className={
                accreditationStatus === "SELF_CERTIFIED" ||
                accreditationStatus === "KYC_VERIFIED"
                  ? "text-emerald-600"
                  : "text-amber-600"
              }
            >
              {accreditationStatus || "Pending"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign size={14} /> Commitment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {investments.map((inv) => (
            <div key={inv.id}>
              <div>
                <span className="text-gray-500">Fund:</span> {inv.fundName}
              </div>
              <div>
                <span className="text-gray-500">Amount:</span> $
                {inv.commitmentAmount?.toLocaleString() || "0"}
              </div>
              <div>
                <span className="text-gray-500">Funded:</span> $
                {inv.fundedAmount?.toLocaleString() || "0"}
              </div>
            </div>
          ))}
          {investments.length === 0 && (
            <span className="text-gray-400">No commitments yet</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
