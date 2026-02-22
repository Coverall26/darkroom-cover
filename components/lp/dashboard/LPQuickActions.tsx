"use client";

import { Button } from "@/components/ui/button";
import {
  FileText,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Building2,
  PenTool,
  Upload,
} from "lucide-react";

interface PendingSignature {
  id: string;
  signingToken: string;
}

interface LPQuickActionsProps {
  canSubscribe: boolean;
  hasSubscription: boolean;
  stagedEnabled: boolean;
  ndaSigned: boolean;
  accreditationStatus: string;
  hasBankLink: boolean;
  bankConfigured: boolean;
  pendingSignatures: PendingSignature[];
  hasLpFundInfo: boolean;
  onSubscribe: () => void;
  onStagedCommit: () => void;
  onNda: () => void;
  onBankConnect: () => void;
  onWireTransfer: () => void;
  onDocuments: () => void;
  onUpload: () => void;
}

/**
 * LPQuickActions — CTA grid for LP dashboard actions.
 * Shows contextual buttons based on investor state.
 */
export function LPQuickActions({
  canSubscribe,
  hasSubscription,
  stagedEnabled,
  ndaSigned,
  accreditationStatus,
  hasBankLink,
  bankConfigured,
  pendingSignatures,
  hasLpFundInfo,
  onSubscribe,
  onStagedCommit,
  onNda,
  onBankConnect,
  onWireTransfer,
  onDocuments,
  onUpload,
}: LPQuickActionsProps) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {canSubscribe && !hasSubscription && (
          <Button
            onClick={onSubscribe}
            className="h-auto py-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            <TrendingUp className="h-8 w-8" />
            <span className="text-lg font-semibold">Invest Now</span>
            <span className="text-xs opacity-80">Subscribe to fund</span>
          </Button>
        )}
        {stagedEnabled && ndaSigned && accreditationStatus !== "PENDING" && (
          <Button
            onClick={onStagedCommit}
            className="h-auto py-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            <DollarSign className="h-8 w-8" />
            <span className="text-lg font-semibold">Staged Commit</span>
            <span className="text-xs opacity-80">Split into tranches</span>
          </Button>
        )}
        {!ndaSigned && (
          <Button
            onClick={onNda}
            className="h-auto py-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            <FileText className="h-8 w-8" />
            <span className="text-lg font-semibold">Sign NDA</span>
            <span className="text-xs opacity-80">Get started</span>
          </Button>
        )}
        {ndaSigned && accreditationStatus === "PENDING" && (
          <Button
            onClick={onNda}
            className="h-auto py-6 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            <CheckCircle2 className="h-8 w-8" />
            <span className="text-lg font-semibold">Verify Status</span>
            <span className="text-xs opacity-80">Complete accreditation</span>
          </Button>
        )}
        {!hasBankLink && bankConfigured && (
          <Button
            onClick={onBankConnect}
            className="h-auto py-6 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            <Building2 className="h-8 w-8" />
            <span className="text-lg font-semibold">Link Bank</span>
            <span className="text-xs opacity-80">For transfers</span>
          </Button>
        )}
        {pendingSignatures.length > 0 && (
          <a
            href={`/view/sign/${pendingSignatures[0].signingToken}`}
            className="h-auto py-6 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all rounded-md"
          >
            <PenTool className="h-8 w-8" />
            <span className="text-lg font-semibold">Sign Document</span>
            <span className="text-xs opacity-80">
              <span className="font-mono tabular-nums">{pendingSignatures.length}</span>{" "}
              pending
            </span>
          </a>
        )}
        <Button
          onClick={onWireTransfer}
          variant="outline"
          className="h-auto py-6 border-gray-700 text-gray-300 hover:bg-gray-800 flex flex-col items-center justify-center gap-2"
        >
          <DollarSign className="h-8 w-8" />
          <span className="text-lg font-semibold">Wire Transfer</span>
          <span className="text-xs opacity-80">Instructions & proof</span>
        </Button>
        <Button
          onClick={onDocuments}
          variant="outline"
          className="h-auto py-6 border-gray-700 text-gray-300 hover:bg-gray-800 flex flex-col items-center justify-center gap-2"
        >
          <FileText className="h-8 w-8" />
          <span className="text-lg font-semibold">Documents</span>
          <span className="text-xs opacity-80">View signed docs</span>
        </Button>
        {hasLpFundInfo && (
          <Button
            onClick={onUpload}
            variant="outline"
            className="h-auto py-6 border-gray-700 text-gray-300 hover:bg-gray-800 flex flex-col items-center justify-center gap-2"
          >
            <Upload className="h-8 w-8" />
            <span className="text-lg font-semibold">Upload Doc</span>
            <span className="text-xs opacity-80">Signed offline?</span>
          </Button>
        )}
      </div>
    </div>
  );
}
